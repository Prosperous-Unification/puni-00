# Verification

## Commands and results

- `bun info twilight-bureaucrat` (2026-09-17): registry returned `404 Not Found`; the package name is currently unregistered. The first sandboxed attempt failed DNS resolution and was not treated as availability evidence.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json | jq -e ...` (2026-09-17): exit 0, predicate `true` after creating all five packets.
- `bun test --preload ../../../tools/test/scratch/preload.ts src/packaging` from `apps/wiki/cli` (2026-09-17): 3 pass, 0 fail; the executable was built for each acceptance run rather than read from an older `dist/`.
- `bunx nx run twilight-bureaucrat:test --skip-nx-cache` (2026-09-17): 643 pass, 0 fail across 34 files; Nx completed the uncached target in 16m41s.
- `bunx nx run twilight-bureaucrat:lint:source --skip-nx-cache` and `bunx nx run twilight-bureaucrat:typecheck --skip-nx-cache` (2026-09-17): both exited 0.
- `bunx nx run twilight-bureaucrat:build --skip-nx-cache` and `bunx nx run twilight-bureaucrat:pack --skip-nx-cache` (2026-09-17): both exited 0. The scratch package contained only the manifest allowlist and produced `twilight-bureaucrat-0.1.0.tgz`; this is build evidence, not publication authorization.
- `bun test --preload tools/test/scratch/preload.ts tools/tool-devsync/src/workspace-policy.test.ts tools/tool-devsync/src/toolchain-policy.test.ts` (2026-09-17): 34 pass, 0 fail.
- `bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts` from `apps/wiki/cli` (2026-09-17): 21 pass, 0 fail; current policy selectors resolve `twilight-bureaucrat` while stored version-1 check and module IDs remain unchanged.

The physical source remains at `apps/wiki/cli` through P4 because the active exhaustive corpus freezes that path. Distribution and Nx identity are already `twilight-bureaucrat`; physical relocation remains deferred to adoption. Root distribution rights are absent: there is no root `LICENSE`, so the package is `UNLICENSED`, omits a fabricated license file, and publication remains blocked pending an actual license and registry ownership.

## Failure proofs

| Check                     | Injected fault                                                   | Production-path test                                                               | Observed result                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package build output      | Successful build returned zero outputs                           | `src/packaging/build.test.ts` calls `buildPackage` with the injected build         | Test failed with `Expected promise to reject` while the output-count refusal was removed; restored guard names `Cannot build Twilight Bureaucrat`     |
| Package manager failure   | Pack command returned exit 23 and stderr `injected pack failure` | `src/packaging/pack.test.ts` calls `packPackage`                                   | Test failed with `expected package pack refusal` while the exit guard was removed; restored guard retains the package-manager diagnostic              |
| Executable dispatch       | Replaced the unknown-command throw with successful return        | Externally spawned test-built `dist/bin.mjs not-a-command` from `/tmp`             | Acceptance test observed exit 0 instead of refusal; restored guard exits nonzero and names `unknown command`                                          |
| Check skip detection      | Removed the streamed-output/skip-probe boundary                  | Relocation activation production preparation with a Bun test that reports one skip | Preparation completed despite the skip; restored probe makes the real preparation refuse and the absent-project negative names the unresolved project |
| Config classification     | Removed `Containerfile` from configuration names                 | Production policy classification test                                              | Candidate container configuration was misclassified; restored rule classifies it as configuration and the watched negative fails when removed         |
| Toolkit digest            | Pending                                                          | Pending                                                                            | Pending                                                                                                                                               |
| Release artifact identity | Pending                                                          | Pending                                                                            | Pending                                                                                                                                               |
