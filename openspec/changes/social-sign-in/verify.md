# Verification Report

**Change**: `social-sign-in`
**Verified at**: 2026-10-11
**Verifier**: batch-10 lane `social-sign-in` (Opus 5.5), worktree `/home/df/wd/puni/b10-social`,
base `origin/batch-10/integration-4` (9a9d5677)

Only observed output is recorded. The h2puni host gate (`bin/h2puni-gate.sh <sha>`) is the
orchestrator's and has not been run by the lane.

## 1. Structural Validation

`bunx @fission-ai/openspec@1.12.0 validate --all --json` → totals `{'items': 170, 'passed': 170, 'failed': 0}`.

## 2. Task Completion

| Task | Reason incomplete                                                           | Blocks archive? |
| ---- | --------------------------------------------------------------------------- | --------------- |
| 3.3  | eye review on the dev stack needs the Auth0 connections (operator, 9.1)     | no              |
| 6.3b | fe-01 "Add <method>" buttons under the account menu: follow-up slice        | yes             |
| 9.x  | Auth0 tenant connections, groups Action, Apple, dev and prod `AUTH_METHODS` | yes (operator)  |

## 3. Delta Spec Sync

| Capability               | Sync status | Note                                                         |
| ------------------------ | ----------- | ------------------------------------------------------------ |
| federated-authentication | ✗ pending   | base spec still lives in `provider-agnostic-oidc-auth`       |
| organization-onboarding  | ✗ pending   | base spec still lives in `organization-ownership-and-access` |

## 4. Failure Proofs

Each fault was injected into the production path, the named test watched failing, and the fault
reverted.

| Check                                             | Fault injected                                        | Test that observed the failure                                                     | Result                                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `parseAuthMethods` duplicate refusal              | refusal removed                                       | `refuses an unknown, empty, duplicated or missing value`                           | Received `["google"]`                                                                                                         |
| `parseAuthMethods` catalogue refusal              | refusal removed                                       | same                                                                               | Received `[]` for `facebook`                                                                                                  |
| `oidcRouteOptionsFromEnv` required `AUTH_METHODS` | defaulted to `none`                                   | `oidc mode refuses a missing AUTH_METHODS`                                         | function did not throw                                                                                                        |
| `startOidcLogin` enablement before state          | check moved after `transactions.save`                 | `refuses a disabled method without saving a transaction`                           | 1 call, expected 0                                                                                                            |
| `startOidcLogin` `connection`                     | dropped from the authorization input                  | `sends the enabled method connection with the login it starts`                     | Received `null`                                                                                                               |
| callback `account_exists`                         | empty 409 restored                                    | `redirects a sign-in whose verified email another account holds to account_exists` | 500, expected 302                                                                                                             |
| swap preflight required `AUTH_METHODS`            | key dropped from be's required list                   | `demands only keys the be release refuses to boot without`                         | expected to contain `AUTH_METHODS`, Received `""`                                                                             |
| swap preflight value rule                         | rule admits every value                               | `refuses only value shapes the be release also refuses`                            | failed on `facebook`                                                                                                          |
| `linkIdentity` several pairs                      | different-own-pair refusal re-added                   | `adds a second pair to an account whose own pair is mapped to it`                  | `identity_collision`                                                                                                          |
| `linkIdentity` idempotent relink                  | mapping inserted even when already this account's     | same                                                                               | `UNIQUE constraint failed`                                                                                                    |
| `assertOwnPairMapped` (D6.2)                      | check disabled                                        | own-pair cases in `external-identity.db.test.ts` and `user-oidc.db.test.ts`        | 3 fail                                                                                                                        |
| model `user-oidc.model.db.test.ts`                | owned pair re-pointed instead of `identity_collision` | `keeps D6 invariants across login and link histories` (seed 20261011, 60 runs)     | counterexample `[Login(google-oauth2\|1, b, false), Login(github\|2, a, false), Link(0, github\|2, a, true)]`, shrunk 4 times |
| `sessionUser` OIDC re-verification                | `identity === null` refusal dropped                   | `refuses a link start whose OIDC token no longer verifies`                         | 500, expected 401                                                                                                             |
| OIDC link start refuses a password                | refusal removed                                       | `refuses a password sent with an OIDC session`                                     | 200, expected 400                                                                                                             |
| `/me` `linkedMethods` from mappings               | account read answers no pairs                         | `adds a second method to an OIDC session without a password`                       | `[]`, expected `['google', 'github']`                                                                                         |
| fe-01 method list validation                      | reply read as raw JSON                                | `never answers a method outside the catalogue`                                     | `ready` with `facebook`                                                                                                       |

- [x] Every check in this change has a row
- [x] Each negative test reaches the production call path
- [x] No filesystem state is distinguished by this change
- [x] No row relies on an exit code

## 5. Gate Output

Per touched project, `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run <project>:test --skip-nx-cache`:

| Project             | Result                                                                        |
| ------------------- | ----------------------------------------------------------------------------- |
| wbs-contracts       | 464 pass, 0 fail                                                              |
| wbs-auth            | 108 pass, 0 fail                                                              |
| wbs-core            | 772 pass, 0 fail                                                              |
| wbs-store-memory    | 146 pass, 0 fail                                                              |
| wbs-store-sqlite    | 1313 pass, 0 fail                                                             |
| wbs-mcp-01          | 333 pass, 0 fail                                                              |
| wbs-gw-01           | 130 pass, 0 fail                                                              |
| tool-remote-scripts | 372 pass, 0 fail (boot-heavy coherence cases given an explicit 120 s timeout) |
| wbs-fe-01           | exit 0: test:unit, UTC Vitest (858 tests) and zoned runs                      |
| wbs-be-01           | 2022 pass, 1 skip, 0 fail                                                     |

`bunx nx run-many -t lint:fast typecheck` over the ten touched projects: "Successfully ran targets
lint:fast, typecheck for 10 projects". Prettier was run on every touched file.

No migration ships; migration lint and the rollback inventory are untouched.

The sign-in card was screenshotted in Chromium (light and dark, 1280 and 375 px) against a local
fe-01 with `/api/auth/methods` stubbed: three methods, a failed read, and `account_exists`. The
method links were restyled from user-agent blue underlined anchors to neutral outline buttons
after the first look.

## Decision

- [x] ⚠️ PASS WITH WARNINGS — 6.3b (account-menu buttons) and operator tasks 9.x remain.
