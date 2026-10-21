# Copying projects between PUNI workspaces

The public source of the companion's shared configuration is `tools/workspace/portability.ts`. Run it from the reviewed public checkout. Repository visibility, Git history, credentials, application packages and release configuration remain independent ([ADR 0037](../adr/0037-public-and-private-monorepos-share-a-portable-project-contract.md)).

```sh
bun tools/workspace/portability.ts sync PUBLIC_CHECKOUT PRIVATE_CHECKOUT
cd PRIVATE_CHECKOUT
bun install
bun install --frozen-lockfile
bun tools/workspace/portability.ts check PUBLIC_CHECKOUT PRIVATE_CHECKOUT
bun tools/workspace/portability.ts copy PUBLIC_CHECKOUT PRIVATE_CHECKOUT apps/website/fe-01
```

`sync` projects the source's Bun version, Nx/TypeScript/Bun-types/Prettier/ESLint package specifications, four Nx cache policies, build dependency semantics and core compiler settings into the destination. It also copies the portable tool, its tests/project settings, `tools/workspace/eslint.portable.mjs` and `tools/workspace/prettier.portable.json`. `.puni-baseline.json` records a SHA-256 fingerprint including those files. `check` refuses divergence and a missing or mismatched receipt. It also refuses these remote Nx cache settings:

- in either `nx.json`: `nxCloudId`, `nxCloudAccessToken`, `nxCloudUrl`, `nxCloudEncryptionKey`, the self-hosted `s3`, `gcs`, `azure` or `sharedFs` blocks, a `tasksRunnerOptions` runner holding an `accessToken`, and a runner or plugin module named `nx-cloud` or ending in `-cache` (such as `@nx/s3-cache`);
- in the running process's environment: `NX_CLOUD_ACCESS_TOKEN`, `NX_CLOUD_AUTH_TOKEN`, `NX_SELF_HOSTED_REMOTE_CACHE_SERVER` and `NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN`.

These are the detected settings, not proof that no remote cache exists: a configuration outside this list, such as one in an `extends` base or a differently named module, is not detected. The receipt's `files` hashes do not establish integrity. `check` compares the destination's actual portable files with the source; only the receipt's `fingerprint` is compared with the receipt itself. All required source components must be readable before synchronization writes anything. Other compiler options, aliases, product policy and application dependencies remain workspace-owned, as do lefthook hooks, the wiki and CI ([ADR 0037](../adr/0037-public-and-private-monorepos-share-a-portable-project-contract.md), batch 10 A18).

Every workspace declares `version: 1` and `visibility: public|private` in `workspace.portability.json`. Each transferable project declares the following in its `project.json`, alongside its name, product tag and four Nx targets:

```json
{
  "metadata": {
    "portability": {
      "visibility": "public",
      "dependencies": ["libs/website/domain/contracts"],
      "aliases": [],
      "packages": { "react": "^19.2.8" }
    }
  }
}
```

Dependencies are explicit relative project paths. Transfer visits the complete declared closure at unchanged paths. `aliases` declares exact TypeScript path aliases owned by that project; the command reads their mappings from the source `tsconfig.base.json`, requires each to point inside its owner, refuses destination collisions and writes them to the destination. Omitted `aliases` means none. It checks the baseline, every project's classification, target presence, product tag, source readability, destination collisions and filesystem entries before creating destination project directories. Use an exclusively owned checkout: concurrent writers and crash-atomic multi-directory commits are not supported. Every import of a source `tsconfig.base.json` alias inside a project must resolve into that project or one of its declared `dependencies`; otherwise transfer stops with `Invalid dependency closure` before writing. Relative imports and package imports are not inferred. `packages` maps each npm package the project needs to its exact specification string; omitted means none. The destination's `dependencies` or `devDependencies` must hold the identical string (`^19.2.8` and `19.2.8` differ), otherwise transfer stops before writing with `Missing package <name>@<spec> in <destination>/package.json: add it, run bun install, then commit bun.lock`. The command never installs packages. `packages` covers what the four Nx targets need. Other entry points are outside it: `apps/website/fe-01/browser/*.mjs` imports `playwright`, which no project declares.

Public promotion refuses any private project in the closure, and independently refuses `apps/website/site` including its licensed Novaform reference. Unknown classifications fail closed. Symlinks, configured environment files, key/database files and common generated directories are refused. The exact `.env.example` sample filename is eligible after its contents are reviewed; `.env` and every other `.env.*` file are refused. This is a transfer boundary, not a general secret scanner; source classification still requires review.

## Evidence, 2026-09-27

- Initial implementation stubs: six tests failed because synchronization was unimplemented.
- Restored implementation: eight tests, 26 assertions passed. Missing, malformed and unreadable trusted configuration are exercised separately. Alias transfer, namespace validation, portable lint synchronization and a checked-in fixture copy added five tests. The exact `.env.example` allowance and configured-environment refusal now pass with fourteen tests and 47 assertions; disabling the environment refusal failed the expected-refusal assertion.
- Removed guards for baseline comparison/receipt, collision admission, private promotion, closure traversal, classification, symlinks and private files: all eight mutants caused assertion failures through the exported production functions. Removing alias collision admission and the namespace tag admission each failed their new tests. Omitting a required lint config let the missing-source test fail; omitting file comparison changed the named failure to a receipt mismatch. The implementation was restored after each fault.
- With the shared ESLint config removed from a library's Nx lint inputs, a warmed lint target reused its success after that config was replaced with a throwing module. Restoring the input made the target run and fail. The config was restored after this fault.
- The checked-in website fixture copy first failed on `Invalid ring: tag`: the tool expected `ring:adapters` from the directory, while the repository policy requires `ring:adapter`. The corrected mapping copied the website fixture and shared dependency into a clean temporary workspace.
- Public → actual private checkout → independently installed clean public fixture preserved the two fixture libraries. The clean public fixture passed all eight Nx test/lint/typecheck/build tasks with cache disabled and a frozen-lock install. Private-direction task results are recorded in the private prototype verification report.
- The fixture lint targets run the copied ESLint and Prettier configurations; semantic compilation is the separate typecheck target. The public repo's normal hook still runs its stronger root product policy. The portable ESLint config checks JavaScript and TypeScript recommended rules across copied code; it does not reproduce every public product boundary. Each lint target includes both shared configs in its Nx cache inputs. This does not prove arbitrary existing projects or application-only dependencies portable without declaring and configuring their prerequisites.

For a new eligible project, run the same four target names after copying and before committing. Do not mark the complete production repository-foundation roadmap done from this two-library fixture.

## Evidence, 2026-10-11 (batch 10, WBS 060.12-060.14)

- Declared packages: two tests first failed because copy ignored `packages`; with the comparison in place a missing package and a `^19.2.0`/`19.2.0` mismatch both stop before writes. Deleting the comparison failed both tests again.
- Remote cache: the test first failed because `check` accepted `nxCloudId`. The guard refuses it in the destination, `nxCloudAccessToken` in the source and a runner `accessToken`, through both `check` and `copy`; removing both guard calls failed the test.
- Review follow-up: a `nx-cloud` runner without a token, `@nx/s3-cache` and `@nx/gcs-cache` plugins, a top-level `s3` block and the `NX_CLOUD_ACCESS_TOKEN`/`NX_SELF_HOSTED_REMOTE_CACHE_SERVER` variables first passed `check`; their tests failed. Disabling the runner-module and plugin checks failed the configuration test, and disabling the environment check failed the environment test.
- Fixture app: `apps/website/fe-01` with `libs/website/domain/contracts` copies into a clean temporary private workspace at unchanged paths, carrying the `@website/contracts` alias. Removing the contracts path from the app's declared dependencies stops transfer with `Invalid dependency closure`; deleting the import ownership check made that test copy the app alone.
- A clean private workspace built from `puni-pr-00` root configuration without project trees accepted `sync` and `check`, refused the copy with the package repair line for the private exact pins (`@types/react@^19.2.18`), then copied after the repair. `NX_DAEMON=false bunx nx run-many -t test,lint,typecheck,build -p website-fe-01,website-contracts --skip-nx-cache` passed all eight tasks there.

### Release boundary

| Boundary                                     | Enforcement                                                                                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private checkouts cannot enter public Git    | ADR 0036; `tools/tool-git-hooks/src/hooks/private-nesting.ts` in `lefthook.yml` and the `Private nesting` step of `.github/workflows/ci.yml`                |
| Public CI needs no private source credential | Public workflows reference only `NPM_TOKEN`, `REGISTRY_READ_AUTH`, `KUBECONFIG_B64` and `DEPLOY_REPO_SSH_KEY`; private CI clones public source tokenlessly  |
| Private release uses the pinned revision     | `puni-pr-00` `deploy/website/dev/build-release.sh` refuses a HEAD other than the reviewed SHA, a dirty checkout and a public pin other than `baseline.json` |
| Release receipts                             | `puni-pr-00` `deploy/website/k8s/release-pin.ts` records SHA-256 receipts, image digests, `private-revision.txt` and `public-tree-ids.txt`                  |
| Novaform never enters public source          | `copyProject` refuses `apps/website/site` and private-classified closures for public destinations before copying bytes                                      |
| No shared remote task cache                  | `verifyBaseline` refuses the listed Nx Cloud, self-hosted cache, cache runner/plugin and environment settings; unlisted configurations are not detected     |
