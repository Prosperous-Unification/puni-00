# Address search test type fix

Worktree `/tmp/puni-cross-api`, branch `feat/cross-project-lookup-integration`, HEAD `731b68a92de92163870eb7483137f4bb373f08c5`.

Changed only `libs/wbs/adapters/store-sqlite/src/project-address-search.db.test.ts`: after the explicit retained-reader guard, bind stable `const captured = retained` and use that narrowed alias in the two lifetime assertions. No non-null assertion, runtime changes, weaker assertion, commits or Git metadata edits. `/tmp/puni-cross-capture` remains frozen and untouched.

Verification:

- `bun test libs/wbs/adapters/store-sqlite/src/project-address-search.db.test.ts`: **5 pass, 0 fail, 20 assertions**, `/tmp/puni-address-search-types-tests.log`.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-store-sqlite:typecheck --skipNxCache --outputStyle=static`: actual **NX Successfully ran target typecheck for project wbs-store-sqlite**, cache skipped, 4.7s; `/tmp/puni-address-search-types-target.log`.
- `bunx eslint libs/wbs/adapters/store-sqlite/src/project-address-search.db.test.ts`: exit 0, no diagnostics.
- `bunx prettier --check libs/wbs/adapters/store-sqlite/src/project-address-search.db.test.ts`: all matched files use Prettier code style, exit 0.
- `git diff --check`: exit 0.

Frozen one-path SHA256:

```text
c18c0e173438f5239e294779b0419a9347a006fd92f76cf97e002b744e9ed2b2  libs/wbs/adapters/store-sqlite/src/project-address-search.db.test.ts
```
