# Verification Report

**Change**: `mcp-refresh-policy`
**Verified at**: 2026-10-13
**Scope**: First inert authority slice only; policy implementation remains incomplete.

## Task completion

Tasks 1.1–1.2 are implemented. Tasks 2.1–3.3 remain open: continuous binding and trusted-time transport, authoritative current policy reader, shared credential-rule admission, held-provider rechecks, end-to-end no-tool/successor proofs, and race proofs. Task 4.1 awaits the PM's exact-SHA host gate. This change is not ready to archive or activate.

## Failure proofs

| Check                                                          | Fault injected                                          | Production-path negative                                                                 | Observed result                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Shared authority guard before fresh-token return in `oauth.ts` | Guard absent before implementation                      | `refuses organization-bound automatic refresh without authority before provider contact` | Expected refusal; received resolved caller session with still-fresh upstream token. Restored guard: pass.                         |
| Same guard, forced path                                        | Guard absent before implementation                      | `refuses organization-bound forced refresh without authority before provider contact`    | Expected refusal; received resolved provider credential. Restored guard: pass.                                                    |
| Same guard, token endpoint                                     | Guard absent before implementation                      | `refuses organization-bound grant refresh without authority before provider contact`     | Expected 400; received 200. Restored guard: pass; zero provider contact, no successor session, refresh secret remains unconsumed. |
| Epoch classification                                           | Replaced epoch test with unconditional legacy admission | `refuses a corrupt nonzero-epoch family read before returning a fresh token`             | Expected SessionRefreshRefused; received upstream credential and session. Restored epoch test: pass.                              |

Tests compose a real durable SQLite store that attaches the existing organization/user/issuer binding during family insertion. The real OAuth consent/code/token flow creates credentials and each real entry path reaches the guard. No production bound issuance or epoch advance was added. Existing store-migration tests cover unsupported/malformed/missing durable epoch startup refusal; the new unsupported classification is additionally exercised by a corrupted family-read dependency on the automatic production path.

## Focused commands and output

`bun test apps/wbs/mcp-01/src/oauth.test.ts --test-name-pattern 'without authority'` before implementation:

```text
0 pass
153 filtered out
3 fail
9 expect() calls
Ran 3 tests across 1 file. [306.00ms]
```

Same command after implementation and final assertion correction:

```text
3 pass
153 filtered out
0 fail
18 expect() calls
Ran 3 tests across 1 file. [356.00ms]
```

`bun test apps/wbs/mcp-01/src/oauth.test.ts apps/wbs/mcp-01/src/session-store.test.ts apps/wbs/mcp-01/src/store-migrations.test.ts`:

```text
206 pass
0 fail
605 expect() calls
Ran 206 tests across 3 files. [12.30s]
```

`bunx eslint apps/wbs/mcp-01/src/oauth.ts apps/wbs/mcp-01/src/oauth.test.ts`: final exit 0. Initial run found four errors from awaiting Bun's void-typed rejection assertions; corrected to await the production promise and assert its caught outcome. Final warning twice:

```text
warning No cached ProjectGraph is available. The rule will be skipped.
          If you encounter this error as part of running standard `nx` commands then please open an issue on https://github.com/nrwl/nx
          @nx/enforce-module-boundaries
```

`bunx tsc --build --force apps/wbs/mcp-01/tsconfig.json`: exit 0, no output.

`git diff --check`: exit 0, no output.

Final additional epoch fault proof and restored focused run:

`bun test apps/wbs/mcp-01/src/oauth.test.ts --test-name-pattern 'without authority|corrupt nonzero-epoch'`:

```text
4 pass
153 filtered out
0 fail
20 expect() calls
Ran 4 tests across 1 file. [304.00ms]
```

`bunx prettier --check` on all changed files: exit 0, `All matched files use Prettier code style!`.

## Pending checks and limits

- Local `openspec` executable is absent; structural validation is pending the host gate.
- Full `bunx nx format:check --all` and test/lint/typecheck/build gate not run locally; PM will run `bin/h2puni-gate.sh <committed-sha>` on h2puni. Direct ESLint skipped module-boundary enforcement because its cached graph is absent.
- No full MCP suite, build, mounted tool refusal, provider-held policy mutation or new identity/time/race proof was run for this inert slice. Existing focused regression coverage passed; new policy contracts remain specified only.
- Delta specs are not synced. No merge, deploy, production migration or activation performed.

## Architecture review follow-up

Astra approved the bounded inert implementation at `add78a3cc703b677fa3ce969f7c2d1091b59d7ed` with no P1/P2 findings. A future activation caveat remains: `server.ts` catches forced-refresh `SessionRefreshRefused` and subsequently calls `endSession`, so the mounted caller ends the family even when a direct authority refusal leaves it intact. Bound requests are currently refused earlier in request authentication and cannot reach this branch. Task 3.3 explicitly owes the caller outcome distinction and mounted family-preservation/terminal-refusal proofs before activation; existing direct refresh tests provide no mounted proof.

The review follow-up changes only proposal-supporting documentation. `bunx prettier --check openspec/changes/mcp-refresh-policy` exited 0 with `All matched files use Prettier code style!`; `git diff --check` exited 0 with no output. A focused Python syntax check exited 0: `Delta-spec syntax: 6 requirements, each with a four-hash scenario and WHEN/THEN; passed. This is not OpenSpec CLI validation.` The absent local OpenSpec CLI and pending exact-SHA host validation remain unchanged.
