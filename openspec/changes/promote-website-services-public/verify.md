# Verification

The reviewed import came from private `puni-pr-00` revision `5e5386d`; the public commit and private snapshot receipt are recorded after publication. Staged source contains only the four eligible project trees and the `.env.example` sample. The sample has empty credential fields and leaves paid inference disabled. No Novaform source, licensed fonts, vendor tree, database, generated `dist`, or configured `.env` file was staged. The staged-file secret scan and `git diff --cached --check` passed.

## Focused checks

- `nx run-many -t test lint typecheck build --projects=website-be-01,website-fe-01,website-contracts,website-store-sqlite`: 16/16 targets passed. API 26 tests/152 assertions, frontend 2/7, SQLite 1/2. Nx used cache for 8 targets; direct API, frontend, store tests and direct TypeScript/ESLint checks also passed during this change.
- `nx run website-store-sqlite:test:package`: passed after copying only the built store package into a temporary directory. Its `store.js` uses its own `import.meta.dir`, and the isolated package applied migrations, saved a draft, reopened it, and enforced expiry.
- `bun test tools/tool-devsync/src/workspace-projects.test.ts tools/tool-devsync/src/workspace-targets.test.ts tools/tool-devsync/src/sync.test.ts --timeout=30000`: 90/90 passed after registering all four projects and app/library restart inputs.
- `bun test tools/workspace/portability.test.ts --timeout=30000`: 14/14 passed. Public-to-private fixture transfer, restricted-source refusal, and exact `.env.example` admission are covered.
- `bun test tools/tool-git-hooks/src/hooks/migration-lint.test.ts --timeout=30000`: 18/18 passed. All staged website SQL passed the production migration lint CLI. The pre-commit Lefthook route selected both the root `src/migration.sql` and a nested migration. An earlier combined nested-brace glob exited zero while logging `migration-lint (skip) no files for inspection`; the separate website command fixed that false green.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: 138/138 valid. The unpinned `openspec` binary is unavailable in this worktree; the CI-pinned Bun invocation works.

## Negative proofs

- With the environment-file refusal disabled, the new portability test failed at its expected-refusal assertion: `.env.production` copied, while the checked-in rule permits only the exact `.env.example` filename.
- With the website migration root widened to `libs/website/adapters`, the new migration lint test failed at `rejects.toThrow`: an injected `portability-fixture/migration.sql` was accepted. The restored root is `libs/website/adapters/store-sqlite/src`.
- The real `website-migration-lint` Lefthook command exited 1 for a temporary nested `migration.sql` containing `DROP TABLE intake_draft`, reporting `migration.sql contains destructive statement: DROP TABLE`; the temporary files were removed.
- Existing production-path tests continue to refuse private-classified dependencies, `apps/website/site`, forged intake origins, overlong descriptions, foreign claims, missing CSRF, unsafe concept text, and edited applied migrations. These guards were not added in this change.

## Scope and limits

The sole non-mechanical frontend adjustment constructs `Headers(init.headers)` before applying the default JSON content type, so caller headers are retained as intended. API readiness and concept-source fallbacks retain their previous false/empty behavior. A broad sandboxed `tool-devsync:test` run had 370 passes and 14 failures because existing dev MCP and BE probe fixtures call `Bun.serve`, which returned `EPERM: operation not permitted, listen` in this sandbox. The two affected test files passed 9/9 when run with local socket permission. The focused inventory, target, and restart checks passed 90/90. A sandboxed `tool-git-hooks:test` run had 128 passes and one failure when a spawned ESLint child returned empty output; its focused scratch-lint test passed 3/3 with normal process access. No host deployment was run.

## Public security scan follow-up

CodeQL on public commit `7d220c418` reported three high findings: SHA-256 on the configured operator password, staged removal of nested markup, and a scheme check that omitted `vbscript:`. The API now lazily derives one Argon2id hash for the configured operator secret and verifies submitted passwords asynchronously. SHA-256 remains for random tokens, CSRF proofs, and body fingerprints. A single anchored allowlist selects the initial plain-text concept subject, with a fixed fallback when that prefix is followed by a colon. The mounted API tests pass 27/27 with 159 assertions, including separate leading `vbscript:` and `https://` inputs.

R5 production-path faults were observed: replacing the Argon2id verifier with `if (false)` made the wrong-password route test fail because it returned a session; replacing the subject allowlist with the raw source made the nested-markup `/concept` test fail; removing the colon boundary made the leading `vbscript:` `/concept` case return `vbscript` instead of `software request`. Every fault was restored before verification. Fresh CodeQL on the next PR head is pending.

## Migration path and trusted inventory follow-up

The full GitHub gate on `74067f4acd9c6fadc5ede3a9c2f7142aa9eaad91` failed `twilight-burokrat:test`: 10 pilot-policy tests encountered `ordinary content libs/website/adapters/store-sqlite/src/down.sql matched 0 classification rules` before their intended assertions. The existing policy classifies SQL under a `migrations` directory. The byte-identical initial forward and rollback scripts were moved to `src/migrations/001_initial`; the applied name remains `001_initial`. Before changing the store path, the real store test failed with `ENOENT` for the old source-root `migration.sql`. After the store path changed, it passed 1/1 with 2 assertions. Built-package, trusted inventory, and old-database reopen checks are pending.
