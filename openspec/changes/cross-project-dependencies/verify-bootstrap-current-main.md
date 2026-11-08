# Current-main bootstrap verification

This slice extends the existing bootstrap certificate, not dependency activation. Source baseline is `c955920c1db94d68d359f53e2f2d5849d64fae7c`; current-main provenance is `acfdc02c7f0acc98606c87312a694ed2b89302ea`.

## Qualified histories

All 103 current-main migration SQL blobs were compared byte-for-byte with the candidate before testing. Their sorted `{name,hash}` manifest SHA-256 is `68eb1ad31c377b493d20da473c6d3d18d842914f8d9179c4888f1f2b1e0123b1`. Only the four named delayed dependency additions differ from the candidate's 107 migrations.

Independent metadata-only dev inspection identified a second exact history: `20260806084828_add_dependencies` has hash `b9b22317105b8562d53f9547a1401a28409c4a4735b591de8c04f0e02e7a9aba`, traced to original Git `24499e8afa6fb0f86430b31718c05633fc2c7d24` at `apps/be-01/drizzle/20260806084828_add_dependencies/migration.sql`. Current main's later-edited SQL adds two CASCADE clauses; the retained original does not. Every other migration identity matches current main. The complete historical manifest SHA-256 is `dc311f3427af09351bf67673a43bcca065a2dc385185a95b85e04faf995c937a`.

The independent reviewer compared the actual replay metadata: all 103 historical identities and all 435 sqlite_master rows equal the observed dev metadata exactly. Canonical replay differs from dev in precisely the dependency table SQL; its other 434 schema objects match. The historical SQL is copied into disposable certificate replay only. Neither live history nor current migration files are rewritten; existing edited-migration rollback refusal remains unchanged.

## Actual boot RED/GREEN

`bun test ./apps/wbs/be-01/src/cross-project-dependency.boot.db.test.ts --test-name-pattern 'boots the exact current-main store' --timeout=30000` first failed through `boot.ts`'s pre-migration inspection with `missing dependency activation migration` (0 pass/1 fail). After canonical certification, the SAME boot passed (1 pass/0 fail).

The exact historical-profile positive then failed with `uncertified dependency authority history` (0 pass/1 fail) before historical replay was implemented. Both positives subsequently passed through the real backend listener and health request. They preserve the complete original 103 name/hash ledger, existing project name/owner, and original dependency table SQL; only the four expected name/hash additions appear. Authority remains DISABLED and external relationships remain empty.

The complete owning suite first passed 37/0 with 183 assertions. A later run concurrent with configured typechecking failed one existing 30-second incapable-binary case: child exitCode was null and Bun reported killing one dangling process; 36 passed/1 failed in 77.43s. This failed run is retained as `/tmp/puni-merge-stack-audit-20261108/bootstrap-concurrent-typecheck-timeout.log`. No timeout was raised and no safety assertion was removed. The final serial rerun after configured checks finished passed **37 tests, 0 failures, 185 assertions in 63.32s**, with the same 30-second case bounds. Its output is `/tmp/puni-merge-stack-audit-20261108/bootstrap-final-owning.log`. Both added original-table-SQL preservation assertions passed.

## Watched production-path negatives

Each injected fault was applied separately to the actual production admission source; its SAME real boot refusal consumer ran, the source was exactly restored, and that SAME consumer passed. Source restoration occurs in a finally block. Logs and patterns are retained in `/tmp/puni-merge-stack-audit-20261108/bootstrap-proof-pairs.json` and `bootstrap-{mutant,restored}-*.log`.

| Injected production fault                      | Owning unsafe startup                                                              | Injected observation                                                             | Exact restoration |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------- |
| Omit pinned available-migration manifest check | Matching altered SQL comment and ledger hash, with unchanged schema                | 0 pass/1 fail: boot wrote source and started listener, breaking snapshot refusal | 1 pass/0 fail     |
| Omit complete applied name/hash identity check | Altered known current-main ledger hash                                             | 0 pass/1 fail: boot wrote source and started listener, breaking snapshot refusal | 1 pass/0 fail     |
| Omit complete replayed-schema comparison       | Dropped current-main index; historical hash paired with canonical cascading schema | 0 pass/2 fail: both booted and mutated source instead of refusing                | 2 pass/0 fail     |

Adjacent Proof comments describe only these observed dependencies. Ordinary negatives additionally cover missing and unknown identities, missing ledger, unreadable hash column, unknown historical hash, unknown pending migration, and each of the four partial delayed-migration ledger entries. The existing enabled/retained-edge/damaged-authority and early historical-prefix cases remain in the full suite.

## Scoped checks and limits

- Frozen isolated dependency install: `bun install --frozen-lockfile`, exit 0, Bun 1.4.4.
- Scoped ESLint over the two production paths and owning boot test: exit 0. Initial direct Drizzle fixture import was rejected by the backend boundary rule; fixture identity reading now uses independent filesystem/crypto parsing.
- `NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-store-sqlite,wbs-be-01 --parallel=2 --output-style=stream`: exit 0, all three tasks succeeded; one valid SQLite typecheck cache hit, backend and module tasks executed. The first backend attempt found a typed expected-ledger mismatch, which was repaired before this pass. An initial sandbox socket fallback printed no tasks and was not counted as verification.
- `bunx openspec validate cross-project-dependencies --json`: valid, exit 0. Existing warnings concern long historical requirements and nonstandard historical sections. The two new requirements each remain below the long-text warning threshold.
- `git diff --check`: exit 0.

No customer rows were read from live stores. No live migration, source ledger rewrite, activation, host gate, full CI, image build, production swap or deployment was performed. Full integration CI/exact-SHA host gates and deployment verification remain the coordinator's separate work. This evidence does not qualify the held constructor/native ownership scenarios.

## Dormant ordinary-authoring regression

`bun test ./apps/wbs/be-01/src/controller/typed-dependency-commands.controller.db.test.ts ./apps/wbs/be-01/src/controller/current-dependency-authoring.controller.db.test.ts --test-name-pattern 'keeps legacy addDependency semantics and stores no typed row|adds a typed node dependency and exposes its minted identity on the tree|a local command does not consume unreadable external authority after construction' --timeout=10000` passed **3/0 with 17 assertions in 5.81s**. These unchanged mounted cases create projects/work items and local dependencies with explicit inactive external authoring, and retain local command execution when external authority reading is unavailable after construction. This verifies ordinary dormant editing separately from external activation. Output: `/tmp/puni-merge-stack-audit-20261108/bootstrap-dormant-local-authoring.log`.
