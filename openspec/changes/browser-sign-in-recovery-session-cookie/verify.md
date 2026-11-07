# Verification Report

**Change:** `browser-sign-in-recovery-session-cookie`\
**Verified at:** 2026-11-07\
**Verifier:** delegated Claude agent, worktree `fix/browser-session-proof-session-cookie` from `origin/main` `1815fd9df`

## Decision S-BSR-A1

A browser that sends `__Host-wbs_session` without `__Host-wbs_access` is proved by `lifecycle.generation(correlation)`: an active lifecycle yields the `oidc` predecessor with its current digest, which sign-in closes and whose refresh token it revokes; an absent, closed or revoked lifecycle stays refused. Assumed by the delegating session from the 2026-11-07 investigation (option 1); alternatives are in `design.md`. Authority: `POST /api/auth/refresh` accepts the correlation alone while the issuing process holds its refresh record; after a restart this proof alone can close an active lifecycle (a bounded denial of service limited to the remaining access-token life, ≤ 3600 s, enforced by revocations), which refresh could not. Cookie theft precondition unchanged (`__Host-`, HttpOnly, Secure, SameSite=Lax, 256-bit random). The merge decision remains the user's.

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

| `proveSessionOnly` store-fault propagation (review fix F2) | return `inactive_session` for every error | `session-only predecessor-store failure remains a server failure` (association table dropped): Expected 500, Received 302 |

Before the fix, the new tests were red: 0 pass, 7 fail (six recovery cases lacked the log entry; the positive answered `/?auth_error=browser_session_unverified`).

### Provider revoke failure (review fix F3)

`closes a session-only predecessor before a provider revoke failure fails the callback` records the current behavior: the old lifecycle is closed and its credential revoked, the local refresh record deleted, the provider revoke called once and failed, the callback answers 500 with no Set-Cookie, and the login transaction is spent. The same test with `__Host-wbs_access=retained-access` added (the unchanged access-plus-correlation proof path that main already had) also passed, so the session-only predecessor fails exactly as the pre-PR path does; `retireBrowserPredecessor` is unchanged.

## 5. Commands and results

All under `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` in the worktree.

| Command                                                                                      | Result                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test` on the 10 be-01 auth/browser controller test files                                | 208 pass, 0 fail                                                                                                                                                                                                     |
| same 10 files after review fixes F2/F3 (full suite not rerun: tests, comments and docs only) | 210 pass, 0 fail                                                                                                                                                                                                     |
| `bunx nx run wbs-be-01:test --skip-nx-cache`                                                 | 3910 pass, 3 skip, 0 fail across 268 files (1435 s); `Successfully ran target test for project wbs-be-01`, exit 0                                                                                                    |
| `bunx nx affected -t lint typecheck --base=origin/main --parallel=2`                         | Successfully ran lint, typecheck for 10 projects and 1 dependency (21 tasks, 14 cache hits)                                                                                                                          |
| `bunx nx format:check --all`                                                                 | exit 0                                                                                                                                                                                                               |
| `bunx --no-install openspec validate --all --json`                                           | 329/329 passed, 0 failed                                                                                                                                                                                             |
| Burokrat `check-indexes working <worktree> origin/main`                                      | exit 0; 39 indexes, no diagnostics; `reviewDebt` lists only untouched pre-existing `libs/wbs/adapters/store-memory/src/README.md` (53/40) and `libs/wbs/application/core/src/module/plan-commands/README.md` (48/40) |

Skipped: the canonical host gate and any dev/prod or credentialed Auth0 verification.

## Decision

- [x] PASS WITH WARNINGS: the host gate and post-deploy dev check remain for the merging session.
