# Verification

## Scope and identity

Implementation base: `ae9b3366e4c0d46ca9f84ea5f197f15f8097b81e` (reviewed #481). Exactly five declarations are added to the repository policy. A structural comparison removes those five additions and compares the complete remaining policy with the base: identical. Actual assets, consumers and provenance paths exist; all five documented SHA-256 values and both font byte sizes match disk bytes. A direct Git blob comparison also proves that all five files in the exact selected external candidate are byte-identical to these tested assets. Classification does not enforce asset digests.

The original external diagnostic policy is immutable: `afbf5c8a64200e7b60d603496c74e4223777a58891a69e3524ce161e822025fa`.
Its successor is `052a3aa30b1ae091968cf01318c7ad89a32e4e3dc144479e73d0c6da0ae965de`. A complete parsed structural comparison proves that its only differences are the same five exact binary declarations, in the same order as the repository additions. Modes, sources, authorities, evidence, relationships and every other field remain identical.

Each external comparison runs the same installed command from its separate consumer:

```text
twib check committed <candidate-repository> <revision> <external-policy> --rule INV-CLASSIFY
twib check committed <candidate-repository> <revision> <external-policy>
```

Both external policies select candidate revision `7e160ba6911504d8bf46bb8674774d1006fb51d5`, candidate identity `27439665644653b40db7ffd26bcda465de1a65e0739d167459c72a0fb0629f12`.

The existing installed package is held fixed at source revision `ac774f0c358db369c2048e537151e263cc29361e`, tarball SHA-256 `b4868c698019f66a2fad6cc2b1ed3a3a40658763304dd9ba8cbfbbcb462d1a56`, toolkit identity `db3dcf59b03555b34b0219b400c9a0ce077df031aa550eb2c1f2f03eae494a79`, executable SHA-256 `3432dfb59cc8d2caa31ea4dbd561aa2963ceb1572174f7e98a5410ece455849c`. The source base differs from the installed source only by the subsequent existing survey documentation commits.

## Commands and observed checks

- `bun test --timeout 60000 apps/twilight-structure/twilight-burokrat/cli/src/architecture/website-binaries.architecture.test.ts`: final restored run passed 10 tests, 70 assertions, 0 failures (131.46 seconds).
- `bunx tsc -p apps/twilight-structure/twilight-burokrat/cli/tsconfig.spec.json --noEmit`: exit 0.
- `NX_DAEMON=false NX_CACHE_DIRECTORY=/tmp/binary-assets-nx-cache bunx nx graph --file=/tmp/binary-assets-graph.json`: exit 0; sandbox denied worker sockets and Nx completed with plugins in the main process.
- `bunx eslint apps/twilight-structure/twilight-burokrat/cli/src/architecture/website-binaries.architecture.test.ts`: exit 0 with the generated Nx graph available.
- OpenSpec `validate --all --json`: 208 valid artifacts (190 changes, 18 specs), 0 failures.
- Scoped `bunx prettier --check` over all eight changed files and `git diff --check`: exit 0.
- Normal Git commit in the isolated source clone; local hooks are not installed, so the listed scoped checks were run explicitly.

The regression builds the production package, packs it, installs the tarball in a separate consumer with lifecycle scripts disabled, and runs the same selected committed candidates through both production CLI and installed executable. It checks five real asset bytes, independent exact metadata expectations, every independently omitted declaration, an undeclared neighbor, ordinary text at every declared path, and staged/working text decoys against the original requested commit.

## Installed survey comparison

| Policy    | Selected rules | Exit | Allowed | Certifies | Findings | Unevaluated                               |
| --------- | -------------- | ---: | ------- | --------- | -------: | ----------------------------------------- |
| Original  | INV-CLASSIFY   |    1 | false   | false     |        0 | INV-CLASSIFY: undeclared apple touch icon |
| Successor | INV-CLASSIFY   |    0 | true    | false     |        0 | none                                      |
| Successor | Full survey    |    1 | false   | false     |      123 | PERF-THRESHOLD; SPEC-SCENARIOS            |

The original serial full run completed in 257.399 seconds; the successor full run completed in 585.86 seconds. Its remaining unevaluated rules report that the performance config differs from reviewed authority and that the scenario overlay has a competing operation. These are unrelated survey blockers. The 123 debt findings are F1: 1, F7: 41, K6: 77 and MOD-LAYOUT: 4. A complete comparison of the fresh original and successor reports is identical after removing only the INV-CLASSIFY unevaluated entry. This also matches the previously recorded exact-package baseline. Inventory-only acceptance is diagnostic and does not certify the candidate.

The concurrent original full attempt produced empty stdout and `Twilight Burokrat validator exited null`, so it produced no verdict. Resource inspection observed one OOM kill in the session cgroup, a 28.76 GB session peak on a 32 GB host, substantial swap use and memory pressure. This supports resource exhaustion as a hypothesis; the exact killed PID was not attributed. The single bounded serial retry completed with a valid refusal verdict in 257.399 seconds and no additional OOM kill; both fresh full reports are now available. No concurrent full extractor is needed to reproduce this comparison.

## Watched negative proofs

All mutations use the production CLI and a freshly built, packed and installed package; each named mutation caused both entrypoint tests to fail, then was restored.

| Injected fault                                                                           | Observed failure                                                                   |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Remove exactly the five repository declarations                                          | Positive CLI checks expected exit 0, received exit 1 for undeclared binary content |
| Widen the binary lookup to accept the neighboring PNG through the apple icon declaration | Neighbor refusal checks expected exit 1, received exit 0                           |
| Accept a declaration without checking binary bytes                                       | Text contradiction checks expected exit 1, received exit 0                         |
| Route committed selection through the staged reader                                      | Requested-commit checks expected exit 0, received exit 1 for staged text decoys    |

## Limits

Execution host: `pop-os`. The h2puni SHA gate, full monorepo format/test/lint/typecheck/build, CI secrets scan, CI migration lint and the broader installed package suite have not run for this change. Focused tests include real package build/pack/install. No publication, push, activation, deployment or runtime asset hash enforcement is claimed. Raw survey stdout/stderr and mutation logs stay local under `/tmp/binary-assets-*`; this file records sanitized evidence only.
