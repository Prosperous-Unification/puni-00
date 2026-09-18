# Twilight Bureaucrat Package and CI/CD Implementation Plan

> **For agentic workers:** Use `executing-plans`; execute P0–P5 in order with a commit and observed verification per task.

**Goal:** Install and run `twilight-bureaucrat` from a pinned npm release in both ordinary CI and trusted admission.

**Architecture:** Keep one source implementation in the product namespace. Compile and pack reusable roles into a standalone package. Consumer trusted bootstrap resolves the package from base-owned pins and produces/selects consumer-specific activations without candidate-controlled execution.

**Tech stack:** Bun 1.4.2, Nx 23.2.0, existing TypeScript/ArkType pins, npm registry, GitHub Actions.

**Spec:** [B1–B3 in the delivery contract](../specs/2026-09-17-twilight-bureaucrat-and-fleet-design.md).

## Global constraints

All [master-plan constraints](2026-09-17-twilight-bureaucrat-and-fleet.md#global-constraints) apply. Preserve version-1 evidence and activation semantics. Published artifacts must not require the source checkout. Commands below are implementation targets unless explicitly identified as existing.

## P0 — Record scope and the rename boundary

**Read:** `apps/wiki/cli/{project.json,README.md}`, `src/policy/{release,release-cli,activation,trusted-modules,prepare-activation-cli}.ts`, their tests, `apps/wiki/consumer/README.md`, `docs/adr/0026-a-wiki-release-is-a-toolkit-not-a-certification.md`, `openspec/changes/{wiki-release,trusted-activation-relocation,agent-scalable-llm-wiki}/tasks.md`.

**Create:** the two OpenSpec packets named in the master plan. Package packet covers B1/B2, consumer packet B3.

**Produces:** explicit acceptance scenarios for standalone installation, missing/corrupt roles, unknown commands, wrong Bun/compiler, exact package pin, candidate tampering, lifecycle script execution, and activation commit mismatch.

- [ ] Reconfirm no exhaustive sweep has frozen a source corpus that this move would invalidate. If one is active, retain the physical source location for P1–P4 and change only the package name/distribution; record that implementation choice and defer the physical move until adoption. Do not invalidate a running experiment silently.
- [ ] Record the rename map below in `design.md`. Keep historical archives/docs intact; only current routes and executable references move.

| Concern                                            | Current                        | Target                                        |
| -------------------------------------------------- | ------------------------------ | --------------------------------------------- |
| Source                                             | `apps/wiki/cli`                | `apps/twilight-bureaucrat/cli`                |
| Product lint                                       | `apps/wiki/eslint.product.mjs` | `apps/twilight-bureaucrat/eslint.product.mjs` |
| Consumer docs/template                             | `apps/wiki/consumer`           | `apps/twilight-bureaucrat/consumer`           |
| Nx project                                         | `wiki-cli`                     | `twilight-bureaucrat`                         |
| Product tag                                        | `product:wiki`                 | `product:twilight-bureaucrat`                 |
| npm name/bin                                       | absent                         | `twilight-bureaucrat`                         |
| New release tags                                   | `wiki-v*`                      | `twilight-bureaucrat-v*`                      |
| Stored check/module IDs, role names, env variables | version 1                      | unchanged                                     |

- [ ] Verify available registry namespace with `bun info twilight-bureaucrat`; distinguish not-found from authentication/network failure. Record registry access as pending if unavailable. Do not choose a different name without the user.
- [ ] Validate the packets and commit only the artifacts and resolved glossary edits.

## P1 — Establish the independently installable boundary

**Files:** move the three product paths above; modify root `tsconfig.base.json`, `.github/workflows/{ci,wiki-release}.yml`, `bin/h2puni-gate-steps.sh`, `docs/wiki-policy/{policy,bootstrap-policy,modules,modules.bootstrap,relationships,relationships.bootstrap}.json` only where current source/target selectors require it, and project discovery tests under `tools/tool-devsync/src/`. Inventory actual policy files before editing; immutable evidence is excluded.

**Create:** `apps/twilight-bureaucrat/cli/package.json`, `src/bin.ts`, `src/bin.test.ts`, `src/packaging/build.ts`, `src/packaging/build.test.ts`.

**Consumes:** existing CLI commands and `prepareToolkitActivation(argv: readonly string[]): string[]`.
**Produces:** executable dispatcher; `buildPackage(destination: string): Promise<void>` that emits the standalone package without an activation. Refactor module-private CLI dispatch to export `runCli(argv: readonly string[]): void` while preserving `import.meta.main` behavior.

- [ ] Write executable tests first. Spawn the new compiled bin from a directory outside the repository; assert `--version` is `0.1.0`, unknown command exits nonzero, and existing `validate-record` fixtures retain their result. Run the test and observe the missing executable.

```ts
import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

test('the installed command rejects unknown operations', () => {
  const executable = fileURLToPath(new URL('../../dist/bin.mjs', import.meta.url));
  const invocation = Bun.spawnSync([process.execPath, executable, 'not-a-command'], {
    cwd: '/tmp',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(invocation.exitCode).not.toBe(0);
  expect(invocation.stderr.toString()).toContain('unknown command');
});
```

Place this test under `src/packaging/` and resolve the dist path accordingly; use a test-built temporary executable for the unit suite so a previous build cannot supply a false green. The external packed-install test in P3 owns the final dist layout.

- [ ] Add the package manifest with an explicit allowlist, a Bun shebang in `bin.mjs`, and no lifecycle scripts:

```json
{
  "name": "twilight-bureaucrat",
  "version": "0.1.0",
  "description": "Module knowledge and trusted repository admission toolkit",
  "type": "module",
  "bin": { "twilight-bureaucrat": "dist/bin.mjs" },
  "files": ["dist/", "README.md", "LICENSE", "NOTICE"],
  "engines": { "bun": "1.4.2" },
  "publishConfig": { "access": "public", "registry": "https://registry.npmjs.org" }
}
```

Set `license` from the actual source license after inspecting root `LICENSE`; do not invent an MIT license or publish without distribution rights. `NOTICE` lists bundled dependencies and their licenses.

- [ ] Build validator and preparers using the existing `buildValidatorBundle` path. Bundle `@shared/validation` and ArkType into the output; forbid unresolved workspace imports. Resolve toolkit asset paths from the installed module URL, never consumer cwd. Retain the trusted TypeScript closure and its identity hash. The consumer workspace/compiler compatibility checks remain enforced.
- [ ] Add uncached Nx `build`, `pack`, `test:package` targets alongside `test`, `lint:source`, `typecheck`; declare exact `dist/` outputs and relevant sources/runtime pins as inputs. Build output should be package-local `dist/` and gitignored.
- [ ] Run the renamed focused tests, module-boundary lint and typecheck. Exercise the physical relocation using existing preparation/selection mechanisms if an activation is configured; do not reset the policy to “inactive” to get a green check.
- [ ] Commit the move and boundary together. Update `verify.md` with both source-test and executable-test results.

## P2 — Package the existing toolkit and preserve activation semantics

**Files:** `src/packaging/{build,manifest}.ts`, `src/packaging/{build,manifest}.test.ts`, moved `src/policy/{release,release-cli,prepare-activation-cli,prepare-relocation-activation-cli,trusted-modules}.ts`, `src/bin.ts`.

**Interface:** the executable exposes `--version`, `lint`, `prepare-activation`, `prepare-relocation-activation`, and all existing validator subcommands. `lint <committed|staged|working> <repository> <revision-or-base>` calls the shipped launcher with the original arguments/environment. Preparers retain all existing flags. Ship `dist/toolkit/{toolkit.json,SHA256SUMS,launcher.sh,snapshotter.ts,validator.mjs,prepare-activation.mjs,trusted-node-modules/}` and the relocation preparer built from existing code. Package metadata records package version and source commit separately from the consumer activation revision.

- [ ] Extend existing release tests through the packaging entrypoint: missing role, modified role, compiler mismatch, wrong Bun and symlinked runtime module each refuse. Reuse current fixture builders and their real candidate Git repositories; do not replace them with `expect(source).toContain(...)` tests.
- [ ] Build once into a fresh directory; calculate the toolkit role digests after copying. Add an outer package manifest file containing version/source SHA and the hash of `toolkit.json`. No policy, review record, selected activation or operator secret belongs in the package.
- [ ] Make `prepare-activation` default its toolkit root to the installed package's toolkit directory while keeping candidate repository, SHA, policy, mapping, review record, audit strata, destination, work, resource lane and cwd identity mandatory. Explicit toolkit overrides must pass the same trust checks; they cannot silently bypass package identity.
- [ ] Test a valid candidate, then commit a one-line change and reuse its old activation: require refusal. Corrupt the installed `validator.mjs`: require refusal before execution. Remove the digest check temporarily and observe that same negative fail; restore and add the observed `Proof:`.
- [ ] Run `bunx nx run twilight-bureaucrat:test --skip-nx-cache`, `:lint:source`, `:typecheck`, `:build`. Commit after all relevant tests pass.

## P3 — Prove the tarball outside the monorepo

**Create:** `src/packaging/install.test.ts`, `fixtures/consumer/{package.json,project.json,README.md}`, fixture policy/mapping/relationships and reviewed-record builders based on `src/policy/relocation-fixtures.ts`.
**Modify:** package `project.json` `test:package` and root Nx inputs.

**Produces:** `/tmp`-hosted consumer integration test that installs the actual packed tarball, not a symlink/workspace dependency. The test creates and cleans up only its own `mkdtemp` directory.

- [ ] Build/pack to a scratch directory with Bun. Record tarball SHA-256, npm integrity, file list and installed version.

```sh
bunx nx run twilight-bureaucrat:build --skip-nx-cache
cd apps/twilight-bureaucrat/cli
bun pm pack --destination /tmp/twilight-bureaucrat-pack
```

The test creates the destination first and reads the produced filename; it must not pick an older file with a broad glob.

- [ ] In the temporary fixture, install that explicit tarball with `bun add --exact --ignore-scripts <absolute-tarball>`, then `bun install --frozen-lockfile --ignore-scripts`. Run `node_modules/.bin/twilight-bureaucrat` with `process.execPath` or its shebang. Sanitize `NODE_PATH`, `BUN_OPTIONS`, workspace environment and ancestor resolution so the monorepo cannot fill missing dependencies.
- [ ] Assert the installed manifest has the canonical name/bin, role assets are present, and no `apps/wbs`, repository policy or secret fixtures shipped. Rename/remove the source checkout access in the test's controlled environment or run in an isolated container with only the tarball/fixture mounted.
- [ ] Prepare a consumer activation using an actual fixture review record; run trusted admission to `certified: true`. Then edit candidate policy to skip its failed check, remove a trusted role, and install a same-version tampered tarball in separate cases. Each must refuse at the expected boundary. A network outage in the offline phase must not alter a valid installed command's behavior.
- [ ] Add an installation without Nx fixture: `--help`/`--version` and record validation work; Nx extraction explicitly refuses absent Nx. Non-Nx repository certification is a future extractor capability, not a claim of this release.
- [ ] Run the whole `test:package` target after removing generated output. Commit the real acceptance tests and record the tarball identity.

## P4 — Release exactly the package that was tested

**Files:** rename `.github/workflows/wiki-release.yml` to `twilight-bureaucrat-release.yml`; update moved release tests, `apps/twilight-bureaucrat/consumer/README.md`, package release documentation.

**Consumes:** P3 tarball; **produces:** registry version `0.1.0` plus retained release asset/digests from the same tarball. Publication is the final external action after a successful dry run and confirmed registry ownership.

- [ ] Test tag/version mismatch, dirty source, missing packaged asset and pre-existing version through the release planner. None may publish. Reusing a tag cannot overwrite an immutable release.
- [ ] Trigger only `twilight-bureaucrat-v*`, resolve tag to commit, verify manifest version, run uncached source checks and P3, then upload the verified tarball between jobs. The publishing job downloads it, verifies its digest and publishes that file. It never rebuilds after verification.
- [ ] Use `bun publish <tarball> --dry-run` before actual publication. Use a least-privilege registry token in a protected release environment until a Bun-compatible trusted-publishing path is explicitly proven. Do not assume npm CLI OIDC instructions work unchanged in Bun. Keep this credential out of ordinary/trusted PR jobs.
- [ ] Publish with `bun publish <tarball> --access public`, then install `twilight-bureaucrat@0.1.0` into a fresh consumer and compare registry integrity with the tested tarball. Record license/ownership check, version, source SHA, registry URL and test evidence. If credentials are unavailable, leave this single publication step visibly pending with the tested tarball ready.
- [ ] Commit the workflow/docs before tagging; the tag must point at the checked commit. No post-tag code changes in the release job.

## P5 — Switch every consumer path to the package

**Files:** root `package.json`, `bun.lock`, `.github/workflows/{ci,trusted-wiki}.yml`, `lefthook.yml`, `bin/tool-wiki-{lint,push-audit}.sh`, `bin/h2puni-gate{,-lib,-steps}.sh`, `apps/twilight-bureaucrat/consumer/trusted-wiki.yml`, `docs/runbook-tool-wiki-activation.md`.
**Create:** `infra/ci/bureaucrat/{package.json,bun.lock}`, `tools/tool-devsync/src/bureaucrat-consumer.test.ts`.

**Consumes:** published package version and P2 compatibility contract. **Produces:** exact root devDependency pin and separate base-owned bootstrap lock. Do not use `workspace:*`, `file:`, caret ranges or network-resolved `latest` in deployed consumer paths.

- [ ] Before switching, build malicious PR fixtures that change the candidate package pin, lockfile, `.npmrc`, `bunfig.toml`, lifecycle scripts, validator source, Nx plugin and activation variables. Add a sentinel script that creates a file if executed; assert it is never executed with admission credentials. Run these through the real consumer bootstrap shell/workflow adapter.
- [ ] Root diagnostics/hook commands invoke the local installed executable. `bin/tool-wiki-lint.sh` remains a compatibility wrapper for external callers; move its reusable implementation into the package and test against recursive self-invocation.
- [ ] Trusted bootstrap copies only its base-owned package manifest/lock into a runner scratch directory, sets an explicit registry and installs frozen with scripts disabled before reading candidate bytes. Use the installed package for activation preparation. The externally selected activation still provides the reviewed runtime used to judge the candidate. A package bump alone must never replace a selected activation in place.
- [ ] Preserve `trusted-wiki`, `gate`, `pixels` check names and existing empty/partial activation provisioning semantics. Upgrade activation selection separately after verifying the package-backed closure. Test mismatched package/activation compatibility as a refusal. Preserve the distinction between unconfigured/inactive and certified.
- [ ] Rewrite source-project exclusions in the full gate from `wiki-cli` to `twilight-bureaucrat`, retain source lint/test/typecheck for the producer, and run the installed package once for consumer admission. Keep `tool-workflows:integration` with its pinned OpenSpec CLI.
- [ ] Teach deployment preparation/F11 to require the admitted source SHA, package identity and activation identity alongside the image digest. Never let the candidate certify its own deployment by editing a shell wrapper.
- [ ] Run the package integration matrix, existing gate-entrypoint tests, affected/pixels workflow tests, OpenSpec validation and h2puni full gate. Prepare a real consumer activation only from real review/check evidence; fixture attestations cannot be reused here.
- [ ] Update the activation runbook with install, upgrade, old-version recovery and exactly which knobs remain externally administered. Commit and capture actual CI evidence. Do not delete compatibility wrappers until all callers have been inventoried and migrated.

## Self-review and requirement coverage

| Contract                             | Task and decisive evidence                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| B1 standalone package                | P1–P4; clean tarball installation and registry round trip                                             |
| B2 protocol/activation compatibility | P0/P2/P5; old fixture records still decode, moved source uses relocation, wrong candidate SHA refuses |
| B3 CI/CD trust                       | P5; candidate executable sentinel never runs, base pin wins, digest/admission identity binds release  |

Do not enlarge this track into new reviewer protocols, Drift integration, non-Nx certification, automatic review fabrication or a different WBS deploy engine. Those are separate requirements.
