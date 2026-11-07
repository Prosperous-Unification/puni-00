# Verification Report

**Change:** `browser-sign-in-recovery-session-cookie`\
**Verified at:** 2026-11-07\
**Verifier:** delegated Claude agent, worktree `fix/browser-session-proof-session-cookie` from `origin/main` `1815fd9df`

## Decision S-BSR-A1

A browser that sends `__Host-wbs_session` without `__Host-wbs_access` is proved by `lifecycle.generation(correlation)`: an active lifecycle yields the `oidc` predecessor with its current digest, which sign-in closes and whose refresh token it revokes; an absent, closed or revoked lifecycle stays refused. Assumed by the delegating session from the 2026-11-07 investigation (option 1); alternatives are in `design.md`. It grants no new authority because `POST /api/auth/refresh` accepts the same correlation alone. The merge decision remains the user's.

## 1. Structural validation

- [x] `bunx --no-install openspec validate --all --json`: 329 items, 329 passed, 0 failed (309 changes, 20 specs, this change included). The change alone validated 1/1 before verify.md was added.

## 2. Task completion

All tasks in `tasks.md` are checked. The canonical host gate (`bin/h2puni-gate.sh`) was not run by this agent (brief: touch no host); CI and the merging session own it.

## 3. Delta spec sync

| Capability                 | Sync status | Note                                                                                        |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `browser-sign-in-recovery` | ✗ pending   | `openspec/specs/browser-sign-in-recovery` does not exist yet; archive both changes together |

## 4. Failure proofs

Each fault was injected into the working tree, the named tests run with `bun test src/controller/oidc-identity.controller.db.test.ts -t …` under `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`, then the file restored.

| Check                                                          | Fault injected                                                    | Observed failure                                                                                                                                                                                                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browser-session.ts` session-only branch                       | refuse a correlation without access (main's behavior)             | `signs a browser whose access cookie expired in again without reset`: Expected `"/"`, Received `"/?auth_error=browser_session_unverified"`; `closes an OIDC predecessor proved by its correlation cookie alone before native login`: Expected 200, Received 401 |
| `proveSessionOnly` lifecycle read                              | return a correlation-derived digest without `generation`          | `closed-session-cookie` and `foreign-session-cookie` recovery cases: Expected 302, Received 500 (also the two positives: 500)                                                                                                                                   |
| store active-state and revocation refusals behind `generation` | remove both refusals from `SqliteBrowserAuthLifecycle.generation` | `closed-session-cookie`: Expected `"/?auth_error=browser_session_unverified"`, Received `"/"` (signed in); `foreign-session-cookie` still passed (absent row is refused by `checkedLifecycle`)                                                                  |
| `proveSessionOnly` typed refusal                               | rethrow `BrowserLifecycleRefusedError`                            | `closed-session-cookie` and `foreign-session-cookie`: Expected 302, Received 500                                                                                                                                                                                |
| `auth-oidc-endpoints.ts` refusal log                           | delete the `logger.info` call                                     | all six `unverifiable predecessor` recovery cases failed `toEqual([['info', refusal]])`                                                                                                                                                                         |

Before the fix, the new tests were red: 0 pass, 7 fail (six recovery cases lacked the log entry; the positive answered `/?auth_error=browser_session_unverified`).

## 5. Commands and results

All under `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` in the worktree.

| Command                                                              | Result                                                                                                                                                                                                               |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test` on the 10 be-01 auth/browser controller test files        | 208 pass, 0 fail                                                                                                                                                                                                     |
| `bunx nx run wbs-be-01:test --skip-nx-cache`                         | 3910 pass, 3 skip, 0 fail across 268 files (1435 s); `Successfully ran target test for project wbs-be-01`, exit 0                                                                                                    |
| `bunx nx affected -t lint typecheck --base=origin/main --parallel=2` | Successfully ran lint, typecheck for 10 projects and 1 dependency (21 tasks, 14 cache hits)                                                                                                                          |
| `bunx nx format:check --all`                                         | exit 0                                                                                                                                                                                                               |
| `bunx --no-install openspec validate --all --json`                   | 329/329 passed, 0 failed                                                                                                                                                                                             |
| Burokrat `check-indexes working <worktree> origin/main`              | exit 0; 39 indexes, no diagnostics; `reviewDebt` lists only untouched pre-existing `libs/wbs/adapters/store-memory/src/README.md` (53/40) and `libs/wbs/application/core/src/module/plan-commands/README.md` (48/40) |

Skipped: the canonical host gate and any dev/prod or credentialed Auth0 verification.

## Decision

- [x] PASS WITH WARNINGS: the host gate and post-deploy dev check remain for the merging session.
