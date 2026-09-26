# Copying projects between PUNI workspaces

The public source of the companion's shared configuration is `tools/workspace/portability.ts`. Run it from the reviewed public checkout. Repository visibility, Git history, credentials, application packages and release configuration remain independent.

```sh
bun tools/workspace/portability.ts sync PUBLIC_CHECKOUT PRIVATE_CHECKOUT
cd PRIVATE_CHECKOUT
bun install
bun install --frozen-lockfile
bun tools/workspace/portability.ts check PUBLIC_CHECKOUT PRIVATE_CHECKOUT
bun tools/workspace/portability.ts copy PUBLIC_CHECKOUT PRIVATE_CHECKOUT libs/website/adapters/portability-fixture
```

`sync` projects the source's Bun version, Nx/TypeScript/Bun-types/Prettier/ESLint package specifications, four Nx cache policies, build dependency semantics and core compiler settings into the destination. It also copies the portable tool, its tests/project settings, `tools/workspace/eslint.portable.mjs` and `tools/workspace/prettier.portable.json`. `.puni-baseline.json` records a SHA-256 fingerprint including those files. `check` refuses divergence or a missing/mismatched receipt. All required source components must be readable before synchronization writes anything. Other compiler options, aliases, product policy and application dependencies remain workspace-owned; this prototype baseline does not yet distribute the entire public governance tool suite.

Every workspace declares `version: 1` and `visibility: public|private` in `workspace.portability.json`. Each transferable project declares the following in its `project.json`, alongside its name, product tag and four Nx targets:

```json
{
  "metadata": {
    "portability": {
      "visibility": "public",
      "dependencies": ["libs/shared/domain/portability-format"],
      "aliases": []
    }
  }
}
```

Dependencies are explicit relative project paths. Transfer visits the complete declared closure at unchanged paths. `aliases` declares exact TypeScript path aliases owned by that project; the command reads their mappings from the source `tsconfig.base.json`, requires each to point inside its owner, refuses destination collisions and writes them to the destination. Omitted `aliases` means none. It checks the baseline, every project's classification, target presence, product tag, source readability, destination collisions and filesystem entries before creating destination project directories. Use an exclusively owned checkout: concurrent writers and crash-atomic multi-directory commits are not supported. The declared closure and aliases are trusted project metadata; maintain them when imports change. Projects needing extra package dependencies require those compatible dependencies in the destination before running their checks. The current command does not infer or install packages.

Public promotion refuses any private project in the closure, and independently refuses `apps/website/site` including its licensed Novaform reference. Unknown classifications fail closed. Symlinks, environment files, key/database files and common generated directories are refused. This is a transfer boundary, not a general secret scanner; source classification still requires review.

## Evidence, 2026-09-27

- Initial implementation stubs: six tests failed because synchronization was unimplemented.
- Restored implementation: eight tests, 26 assertions passed. Missing, malformed and unreadable trusted configuration are exercised separately. Alias transfer, namespace validation, portable lint synchronization and a checked-in fixture copy added five tests, for thirteen tests and 43 assertions.
- Removed guards for baseline comparison/receipt, collision admission, private promotion, closure traversal, classification, symlinks and private files: all eight mutants caused assertion failures through the exported production functions. Removing alias collision admission and the namespace tag admission each failed their new tests. Omitting a required lint config let the missing-source test fail; omitting file comparison changed the named failure to a receipt mismatch. The implementation was restored after each fault.
- With the shared ESLint config removed from a library's Nx lint inputs, a warmed lint target reused its success after that config was replaced with a throwing module. Restoring the input made the target run and fail. The config was restored after this fault.
- The checked-in website fixture copy first failed on `Invalid ring: tag`: the tool expected `ring:adapters` from the directory, while the repository policy requires `ring:adapter`. The corrected mapping copied the website fixture and shared dependency into a clean temporary workspace.
- Public → actual private checkout → independently installed clean public fixture preserved the two fixture libraries. The clean public fixture passed all eight Nx test/lint/typecheck/build tasks with cache disabled and a frozen-lock install. Private-direction task results are recorded in the private prototype verification report.
- The fixture lint targets run the copied ESLint and Prettier configurations; semantic compilation is the separate typecheck target. The public repo's normal hook still runs its stronger root product policy. The portable ESLint config checks JavaScript and TypeScript recommended rules across copied code; it does not reproduce every public product boundary. Each lint target includes both shared configs in its Nx cache inputs. This does not prove arbitrary existing projects or application-only dependencies portable without declaring and configuring their prerequisites.

For a new eligible project, run the same four target names after copying and before committing. Do not mark the complete production repository-foundation roadmap done from this two-library fixture.
