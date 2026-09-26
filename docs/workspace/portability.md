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

`sync` projects the source's Bun version, Nx/TypeScript/Bun-types/Prettier package specifications, four Nx cache policies, build dependency semantics and core compiler settings into the destination. `.puni-baseline.json` records their SHA-256 fingerprint. `check` refuses divergence or a missing/mismatched receipt. The source configuration must be readable and valid before synchronization writes anything. Other compiler options, aliases, product policy and application dependencies remain workspace-owned; this prototype baseline does not yet distribute the entire public governance tool suite.

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
- Restored implementation: eight tests, 26 assertions passed. Missing, malformed and unreadable trusted configuration are exercised separately. Alias transfer and namespace validation added two tests, for ten tests and 32 assertions.
- Removed guards for baseline comparison/receipt, collision admission, private promotion, closure traversal, classification, symlinks and private files: all eight mutants caused assertion failures through the exported production functions. Removing alias collision admission and the namespace tag admission each failed their new tests. The implementation was restored after each fault.
- Public → actual private checkout → independently installed clean public fixture preserved the two fixture libraries. The clean public fixture passed all eight Nx test/lint/typecheck/build tasks with cache disabled and a frozen-lock install. Private-direction task results are recorded in the private prototype verification report.
- The fixture lint targets run ESLint and Prettier; semantic compilation is the separate typecheck target. This does not prove arbitrary existing projects, application-only dependencies or root aliases portable without declaring and configuring their prerequisites.

For a new eligible project, run the same four target names after copying and before committing. Do not mark the complete production repository-foundation roadmap done from this two-library fixture.
