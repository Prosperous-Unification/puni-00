# Verification

## Commands and results

- `bun info twilight-burokrat` (2026-09-17): registry returned `404 Not Found`; the package name is currently unregistered. The first sandboxed attempt failed DNS resolution and was not treated as availability evidence.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json | jq -e ...` (2026-09-17): exit 0, predicate `true` after creating all five packets.
- `bun test --preload ../../../tools/test/scratch/preload.ts src/packaging` from `apps/wiki/cli` (2026-09-17): 3 pass, 0 fail; the executable was built for each acceptance run rather than read from an older `dist/`.
- `bunx nx run twilight-burokrat:test --skip-nx-cache` (2026-09-17): 643 pass, 0 fail across 34 files; Nx completed the uncached target in 16m41s.
- `bunx nx run twilight-burokrat:lint:source --skip-nx-cache` and `bunx nx run twilight-burokrat:typecheck --skip-nx-cache` (2026-09-17): both exited 0.
- `bunx nx run twilight-burokrat:build --skip-nx-cache` and `bunx nx run twilight-burokrat:pack --skip-nx-cache` (2026-09-17): both exited 0. The scratch package contained only the manifest allowlist and produced `twilight-burokrat-0.1.0.tgz`; this is build evidence, not publication authorization.
- `bun test --preload tools/test/scratch/preload.ts tools/tool-devsync/src/workspace-policy.test.ts tools/tool-devsync/src/toolchain-policy.test.ts` (2026-09-17): 34 pass, 0 fail.
- `bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts` from `apps/wiki/cli` (2026-09-17): 21 pass, 0 fail; current policy selectors resolve `twilight-burokrat` while stored version-1 check and module IDs remain unchanged.
- `bun test --preload ../../../tools/test/scratch/preload.ts src/relationships/relationships.test.ts` from `apps/wiki/cli` (2026-09-17): 24 pass, 0 fail in 129.59s after requiring explicit Nx workspace metadata.
- `bun nx run twilight-burokrat:test:package --skip-nx-cache` (2026-09-17): 8 pass, 0 fail across four packaging files in 29.6s. The target rebuilt and packed first, installed the explicit tarball outside the checkout with lifecycle scripts disabled, prepared a certified activation, rejected stale and tampered inputs, and ran version and record validation with only `HOME` and `PATH` inherited. An invalid loopback registry proved the installed version command remained offline.
- Exact P3 artifact built from `e5ff841e41a13001b72549c1aace614e38342ca6`: 161 files, installed version `0.1.0`, SHA-256 `609a8dd79c568b7c22630138c119fec85175276666bb2b468c551fe1f54611f2`, npm shasum `6897b4ad514fb09078f7614e67f1a9a43349ee31`, and integrity `sha512-p4lGfOXW5YNb+WshDOlVpYwj/QcDe1VpaaZZBw8kTcqvS+kmVUBnRjXIM9GcHtfQF1VVnpGFFo6QuiAp2y+fcw==`.
- `bun test --preload ../../../tools/test/scratch/preload.ts src/packaging/release.test.ts` from `apps/wiki/cli` (2026-09-17): 6 pass, 0 fail. Production-path cases cover malformed, unknown and misplaced tags; tag/source/packed version mismatch; dirty source; missing roles and compiler closure; packed source drift; occupied transfer records; existing registry versions; unknown registry state; renamed artifacts; malformed records; and changed bytes.
- Focused gate-entrypoint test (2026-09-17): 1 pass, 51 filtered out, 75 assertions. It pins the new tag trigger, read-by-default permissions, protected publishing environment, action SHAs, package target, transfer verification, dry run, non-overwriting release assets, and ordering before publication.
- `bun nx run twilight-burokrat:lint:source --skip-nx-cache` and `bun nx run twilight-burokrat:typecheck --skip-nx-cache` (2026-09-17): both exited 0 after the package release planner and workflow changes.
- Exact P4 `bun nx run twilight-burokrat:test:package --skip-nx-cache` from `bde440bc533bd8479d302d6748008af707d341d0` (2026-09-17): 14 pass, 0 fail across five packaging files in 30.4s. The resulting 161-file tarball has SHA-256 `59acb99da45492edc4f15cbadcf5c12e8a281a0d3fb89ccf7fe265fd47cf1217`, npm shasum `f5e1a89d22da500bce0106a335f7e9231aa1e20d`, and integrity `sha512-unQmol3k4UINW6D3mflQTk5pYgwJUMWhkA3s+vFlELA6EOrB/aUnl5hR8rBEcODNsN12NLZVsSjrM2PMiCWRcg==`.
- `bun publish dist/twilight-burokrat-pack/twilight-burokrat-0.1.0.tgz --dry-run` (2026-09-17): exit 0 and reported `twilight-burokrat@0.1.0 (dry-run)` with the same shasum. Bun also emitted `warn: bin 'dist/bin.mjs' does not exist` despite that member being present and exercised by the packed-install suite; the warning is recorded rather than treated as a failed command.
- The repository `yaml` parser loaded `.github/workflows/twilight-burokrat-release.yml` and found both `verify` and `publish` jobs. `actionlint` is unavailable on this host, so no actionlint result is claimed.
- Review remediation at `08e51424a209ff1cdbe13284aa0eadfa29c60ba6` rebuilt the package and passed `twilight-burokrat:test:package` with 21 tests and 127 assertions in 36.7s. The installed executable ran `--help`, and validation passed while its source directory was renamed out of reach; validation and preparation now verify the installed package/toolkit join. Installed-command negatives refused a missing or substituted validator, explicit alternate toolkit, Bun drift, compiler-closure drift, a symlinked runtime package, and a candidate target reporting a skipped test. The test HOME is the fresh consumer; only the explicitly pinned Volta toolchain location is retained so Nx can launch Node.
- Exact review-remediation artifact built from `08e51424a209ff1cdbe13284aa0eadfa29c60ba6`: 161 files, SHA-256 `41dfe6d3b0a07cfb2f598b96e9d803c084c5d0e08fcc07fc253cfaf331058ad7`, npm shasum `f9ce09af43e7c2b4e87fb5c4e9cd726575675589`, and integrity `sha512-tluDBll4Mu4j5lM9qVqLYD4rQnYkWc5gwuRO9tAeU+v2BUGa/wWptfvyqJ6RjrIhLemYFPuKSbgUvbFqqtM15g==`.
- The release adapter tests passed 10 cases covering immutable event-SHA checkout and record joins, explicit event-tag fetching from a SHA-only clone, explicit GitHub 404/200/unknown states, enforced distribution-license readiness, registry propagation and integrity comparison, and the fresh no-scripts registry-install workflow step. The workflow still has not run because publication prerequisites remain external.
- The subsequent review fixes passed `twilight-burokrat:test:package` with 23 tests and 144 assertions in 39.8s. Validation passed with the source workspace hidden by a bubblewrap mount namespace. Certified candidate fixtures in the P3 paths use a copied dependency closure instead of the source checkout's `node_modules`, and the stale-activation negative commits a policy mutation that skips a failed check. Installed-manifest absence, unreadability, malformed JSON and invalid schema are each exercised through the packed command.
- Exact final P1–P4 package run from `c1fc6ff781b9cb221571591650c943250ec8695e`: 23 tests passed with 146 assertions in 40.1s. The 161-file tarball has SHA-256 `5c3e7565cc68fe589f0af27ed7eb1e2924dd8a551d9fcf5a528f445c429ec7da`, npm shasum `c337eee7b79d77a38cc0c62b9909242a8fc21ddf`, and integrity `sha512-umzhQrFJ6egXKma3QakPmy1oy2iCmWAy3cskTHZqmNiPBAe0Og5AtKxj8QbG7NMfhwUd/OJHqYPWP4nxuuVPoQ==`. The package manifest records that exact source revision. Astra-high review returned READY at the same commit after the workflow provisioned and smoke-tested Bubblewrap.
- `twilight-burokrat:lint:source` and `twilight-burokrat:typecheck` both exited 0 after the subsequent review fixes. The repository YAML parser loaded the updated workflow and found both release jobs; `actionlint` remains unavailable.

The physical source remains at `apps/wiki/cli` through P4 because the active exhaustive corpus freezes that path. Distribution and Nx identity are already `twilight-burokrat`; physical relocation remains deferred to adoption. Package distribution rights are absent: `apps/wiki/cli` has no `LICENSE`, so the package is `UNLICENSED`, omits a fabricated license file, and the release planner now blocks publication until both the manifest and package license are supplied.

Publication was not attempted. The exact tarball is ready, while the root license, npm ownership, protected `twilight-burokrat-release` environment, least-privilege `NPM_TOKEN`, tag ruleset and `twilight-burokrat-v0.1.0` tag remain external prerequisites. No registry version or release asset exists from this work.

## F12 status (2026-09-18)

Nothing new ran for this packet in F12. P0–P3 and the P4 release machinery are complete as
recorded above; P4 stays open because no registry version exists. `tasks.md` names the prepared
artifact and the next command. Not claimed: any GitHub Actions run of the release workflow,
`actionlint` (not installed), or registry propagation.

## Failure proofs

| Check                      | Injected fault                                                                    | Production-path test                                                                   | Observed result                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package build output       | Successful build returned zero outputs                                            | `src/packaging/build.test.ts` calls `buildPackage` with the injected build             | Test failed with `Expected promise to reject` while the output-count refusal was removed; restored guard names `Cannot build Twilight Burokrat`                                                                                                                               |
| Package manager failure    | Pack command returned exit 23 and stderr `injected pack failure`                  | `src/packaging/pack.test.ts` calls `packPackage`                                       | Test failed with `expected package pack refusal` while the exit guard was removed; restored guard retains the package-manager diagnostic                                                                                                                                      |
| Executable dispatch        | Replaced the unknown-command throw with successful return                         | Externally spawned test-built `dist/bin.mjs not-a-command` from `/tmp`                 | Acceptance test observed exit 0 instead of refusal; restored guard exits nonzero and names `unknown command`                                                                                                                                                                  |
| Check skip detection       | Removed the streamed-output/skip-probe boundary                                   | Relocation activation production preparation with a Bun test that reports one skip     | Preparation completed despite the skip; restored probe makes the real preparation refuse and the absent-project negative names the unresolved project                                                                                                                         |
| Config classification      | Removed `Containerfile` from configuration names                                  | Production policy classification test                                                  | Candidate container configuration was misclassified; restored rule classifies it as configuration and the watched negative fails when removed                                                                                                                                 |
| Toolkit digest             | Replaced the digest refusal with a no-op                                          | Packed-install preparation with a modified installed `validator.mjs`                   | Test failed because preparation advanced to unrelated candidate validation; restored guard refuses `toolkit role differs from toolkit.json: validator.mjs` before execution                                                                                                   |
| Toolkit role readability   | Renamed the installed `validator.mjs`                                             | Packed-install preparation through the installed executable                            | Before the boundary the production path exposed raw `ENOENT`; restored guard refuses `toolkit role is unreadable: validator.mjs`                                                                                                                                              |
| Nx workspace presence      | Renamed candidate `nx.json` before committing the tested revision                 | Packed-install preparation through static relationship extraction                      | Before the boundary extraction advanced to a later launcher failure; restored guard refuses the absent Nx workspace explicitly                                                                                                                                                |
| Release artifact identity  | Removed each planner/transfer refusal in turn                                     | `src/packaging/release.test.ts` through the production planner and verifier            | Tag syntax, unknown tag, tag placement, dirty source, source version, required role, compiler closure, packed coordinate, packed source, registry existence, record occupancy/schema/name, and digest mutations each made its watched negative fail; all guards were restored |
| Registry availability      | Classified an injected timeout as package absence                                 | Production registry lookup used by the release CLI                                     | Unknown-state test failed because the planner would have made the version eligible; restored lookup accepts only explicit 404/not-found diagnostics as absence                                                                                                                |
| Installed package identity | Disabled the outer toolkit-identity comparison                                    | Installed `validate-record` with a self-consistent substituted toolkit                 | Test reached and executed the substituted validator, then failed with its injected `ReferenceError`; restored boundary refuses `installed toolkit differs from package manifest` before execution                                                                             |
| Explicit toolkit identity  | Disabled the package identity comparison for `--toolkit`                          | Production toolkit preparation with another valid toolkit                              | Test advanced to candidate resolution and reported `candidate revision is unknown`; restored boundary refuses `selected toolkit differs from package manifest`                                                                                                                |
| Skip-probe context         | Forced a reviewed non-root target's skip probe to repository root                 | Installed preparation of a target with a relative preload and one skipped test         | Test observed `check failed ... exit 1` instead of the skip refusal; restored cwd runs the reviewed invocation context and refuses `check skipped work: check.fixture.module`                                                                                                 |
| Release event identity     | Disabled the tag/event comparison                                                 | Release planner with another valid 40-byte event SHA                                   | Watched release negative failed because the moved event/tag state became eligible; restored planner names `release tag differs from workflow event`                                                                                                                           |
| Distribution rights        | Removed both license readiness checks and the required tar member                 | Release planner with `UNLICENSED` and no package `LICENSE`                             | Test failed with `expected package release refusal` because the package became eligible; restored planner refuses before registry publication                                                                                                                                 |
| GitHub release state       | Classified injected HTTP 500 as an existing-release response                      | Executable release-state adapter used by the workflow                                  | Test received `GitHub release already exists` instead of the unknown-state refusal; restored adapter accepts only HTTP 404 as absence                                                                                                                                         |
| Registry round trip        | Disabled the registry integrity comparison                                        | Post-publication verifier with another sha512 integrity                                | Test failed with `expected package release refusal`; restored verifier waits for the coordinate and compares registry integrity with `release.json`                                                                                                                           |
| Workflow checkout identity | Replaced one `${{ github.sha }}` checkout with `${{ github.ref }}`                | Workflow contract test                                                                 | Test found one immutable checkout instead of two; restored workflow pins both jobs and passes the event SHA into both release-record boundaries                                                                                                                               |
| Workflow tag availability  | Omitted the explicit event-tag fetch from a SHA-only checkout                     | Release planner in a clone made with `--no-tags`                                       | Planner refused `release tag is unknown`; fetching only the event tag restored preparation while HEAD remained at the event SHA                                                                                                                                               |
| Installed manifest states  | Disabled the read, parse and schema boundaries in turn                            | Packed `validate-record` with missing, directory, malformed and empty-object manifests | Each installed-command negative advanced to a later outer-identity failure or lost its required state label; restored boundaries refuse every invalid state before toolkit execution                                                                                          |
| Registry response state    | Disabled malformed-success, unknown-failure and retry-exhaustion refusals in turn | Post-publication verifier with malformed JSON, timeout and twelve 404 responses        | Each watched negative failed by accepting undefined integrity, misclassifying the timeout, or returning after bounded retries; restored guards keep all three states release-blocking                                                                                         |

## Declaration closure repair (2026-10-15)

The repair starts from exact candidate/tool base `7e160ba6911504d8bf46bb8674774d1006fb51d5`.
All work is in an isolated clone; the existing raw packaged-survey evidence bundle is not part
of this change. The release-owned roots were reviewed against the same 21-config policy scope.
No candidate-import expansion, optional-peer expansion, or ambient dependency fallback was added.

Initial observations:

- Nested traversal regression failed because the original collector selected hoisted `shared`
  and `decoy` instead of `vendor/node_modules/shared` and its nested-only `leaf` dependency.
- External installed extraction with nonempty selectors and a public entrypoint failed with
  `ENOENT` for the hidden source checkout's `@typescript/old/lib`.
- After packaging the reviewed roots, installed verification refused a closure digest mismatch.
  Tar/source comparison found exactly the five metadata omissions listed in `design.md`, with
  no other missing, added, or changed package bytes. The canonical-copy regression failed while
  `elysia/bunfig.toml` was retained. Only those five installed paths are now omitted.
- Direct nested/scoped intermediate-symlink negatives initially returned ambient package paths.
  Every package path component is now inspected before any selected instance is read or copied.

Watched fault proofs (all injected changes restored):

| Boundary                  | Production path and injected fault                                                                                   | Observed oracle                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Installed manifest shape  | `trustedModuleNames`; removed manifest object boundary                                                               | `null` lost its named refusal and `[]` was admitted; both negatives failed                                    |
| Mandatory dependency map  | `trustedModuleNames`; removed dependency-map boundary                                                                | `null` lost its named refusal and `[]` was admitted; both negatives failed                                    |
| Dependency path/version   | `trustedModuleNames`; removed dependency-name/version validation                                                     | `../../escape` and numeric version lost the named malformed-dependency refusal                                |
| Selected nested closure   | `copyTrustedModules`; copied nested `node_modules` wholesale                                                         | Unrelated nested package was present; expected missing-file assertion failed                                  |
| Intermediate symlinks     | `releaseToolkit` in an external fixture; restored final-component-only inspection                                    | Ambient compatible nested dependency was copied; negative threw `expected a refusal, but the action resolved` |
| Compiler/library version  | Relationship CLI; disabled package-version comparison                                                                | Mismatched `0.0.0` standard libraries extracted successfully; expected exit 1 failed                          |
| Compiler default filename | Relationship CLI; restored source-installation filename                                                              | Arbitrary-basename vendor positive refused instead of extracting                                              |
| Compiler default location | Relationship CLI; restored source-installation directory                                                             | Arbitrary-basename vendor positive refused instead of extracting                                              |
| Packaged vendor digest    | Rebuilt/repacked installed CLI with closure comparison disabled, then appended a comment to `arktype/out/index.d.ts` | External extraction exited 0; corruption negative expected 1 and failed                                       |

Missing and unreadable manifests are distinct focused cases; compiler-library absence,
unreadability and version mismatch also have separate production CLI cases. Existing relationship
negatives retain candidate modules, ancestor decoys, escape links and outside-input refusals.

Fresh local checks:

- `bun test ./apps/twilight-structure/twilight-burokrat/cli/src/policy/trusted-modules.test.ts`:
  14 passed, 28 assertions. The root list contains all reviewed nested Ark instances.
- `bun test ./apps/twilight-structure/twilight-burokrat/cli/src/relationships/relationships.test.ts --timeout=120000`:
  48 passed, 616 assertions, 147.21 seconds.
- `bun test ./apps/twilight-structure/twilight-burokrat/cli/src/policy/release.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/policy/relocation-activation.test.ts --timeout=120000`:
  47 passed, 136 assertions, 115.10 seconds. The first run exposed an absent-install diagnostic
  regression (zod instead of TypeScript); compiler-first traversal restores that named refusal.
- `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-burokrat/cli/src/packaging --timeout=120000`:
  48 passed, 352 assertions across eight source files, 287.38 seconds. This complete suite ran
  with scoped sandbox escalation because its loopback registry listener otherwise receives
  EPERM. No package cases were skipped. An earlier unscoped-path invocation also collected
  emitted JS tests; its output is not the complete-source acceptance result.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CACHE_DIRECTORY=/tmp/burokrat-closure-nx-cache bun nx run twilight-burokrat:lint:source --skip-nx-cache`:
  exit 0. Direct ESLint without an Nx graph initially warned that module-boundary rules were
  skipped; the recorded Nx invocation built the graph and passed the complete source lint.
- `bun node_modules/.bin/tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json`:
  exit 0. Changed-file Prettier check and `git diff --check`: exit 0.
- Cached pinned `@fission-ai/openspec@1.12.0/bin/openspec.js validate twilight-burokrat-package --json`:
  one change passed, zero failed. No project dependency was added for OpenSpec.

The existing secret-named filename oracle falsely rejected vendor Bun secrets API docs and
Jose's public `generate_secret` code. It still checks repository-owned assets outside the pinned
vendor closure. Repacking with a public `dist/secrets-fixture.txt` sentinel made that installed
assertion fail; the sentinel was then removed. No credentials were used in that proof.

A preliminary full packaged survey retained the exact diagnostic policy SHA-256
`afbf5c8a64200e7b60d603496c74e4223777a58891a69e3524ce161e822025fa` and target candidate
`7e160ba6911504d8bf46bb8674774d1006fb51d5` (candidate identity
`27439665644653b40db7ffd26bcda465de1a65e0739d167459c72a0fb0629f12`). It returned typed JSON,
exit 1 and `certifies:false`, with 41 F7 debt findings and four MOD-LAYOUT debt findings.
Vendor/module/stdlib absence no longer blocked it. Remaining unevaluated rules are F1,
K2–K6 and REL-EXTRACT because `libs/shared/domain/failures/src/index.ts` resolves through six
configs; INV-CLASSIFY because of an undeclared website PNG; PERF-THRESHOLD because its config
differs from reviewed authority; and SPEC-SCENARIOS because of a competing wbs-domain overlay.
The policy was not narrowed. Final exact-commit tool identity and repetition follow below.

No host-wide gate, registry publication, merge, deployment, or certification was performed.

### Exact committed artifact and full-policy repetition

The tool was rebuilt from clean implementation commit `1ae4142bd34d37fa15678fabeb8fc6b34242c14f`,
packed with Bun 1.4.2, installed with lifecycle scripts disabled into a new external consumer,
and exercised through its installed `node_modules/.bin/twib`. This evidence-only follow-up
changes no implementation bytes.

| Identity                     | Value                                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| Package                      | twilight-burokrat@0.1.0                                            |
| Tarball SHA-256              | `83ed1bb1aea631f49422e2402126f23640a058792fa65573e814671ef671bc19` |
| Tarball size                 | 31,757,428 bytes                                                   |
| Installed executable SHA-256 | `cc7b935e2f204f0f3d89d71a960012760dcd974c4ee2b475f1729a4634d984ed` |
| Toolkit identity             | `cfd378dd3831400215fe0818178a331fdccdb162d6cb1747598f73babf1e2b95` |
| Trusted closure identity     | `efe812480b995ccef8634e9c17adf9a51d8f3e016c771232ec49ea71aaba94ac` |
| Selected installed instances | 348                                                                |
| Diagnostic policy SHA-256    | `afbf5c8a64200e7b60d603496c74e4223777a58891a69e3524ce161e822025fa` |
| Candidate revision           | `7e160ba6911504d8bf46bb8674774d1006fb51d5`                         |

Exact installed hidden-source extraction and vendor-corruption acceptance passed: one test,
14 assertions, 9.55 seconds. The full survey command was:

```sh
/tmp/burokrat-closure-exact-consumer/node_modules/.bin/twib check committed /tmp/puni-burokrat-survey-20261015 7e160ba6911504d8bf46bb8674774d1006fb51d5 /tmp/burokrat-closure-diagnostic-policy.json
```

It ran from `/tmp/burokrat-closure-exact-consumer` with only its HOME,
`PATH=/home/df/.bun/bin:/usr/bin:/bin`, and the named `/tmp/burokrat-bun-temp` and
`/tmp/burokrat-bun-cache` Bun directories. It finished in 212.994 seconds,
exit 1, with `allowed:false` and `certifies:false`. The candidate identity stayed
`27439665644653b40db7ffd26bcda465de1a65e0739d167459c72a0fb0629f12`. It reproduced the 45 debt findings and all ten
unevaluated rules listed above, without any missing vendor dependency or source-library refusal.
The remaining public-entrypoint overlap, binary inventory, Performance authority and competing
overlay refusals are preserved; this is not a successful WBS admission or complete rule evaluation.

Final `openspec validate --all --json` using pinned 1.12.0 passed all 206 entries
(188 changes and 18 specs). The raw survey streams and full identity payload remain only in
`/tmp`; they are not included in this PR.
