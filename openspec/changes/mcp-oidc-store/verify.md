# MCP OIDC store verification

## Section 1 — current behavior and callback ordering

The baseline `apps/mcp-01/src/oauth.test.ts` contained **24 cases**, counted from the
current file rather than copied from the task text. Its registration restrictions,
dynamic-client expiry, anonymous/proven per-source limits, serial and concurrent promotion
reservation, global and per-client pending limits, grant capacity, and session capacity all
passed. The unmodified whole MCP target passed **114 tests in 10 files** with 454 assertions.

The first auth-target run inside the filesystem sandbox was not green: **91 passed / 2 failed**
because `Bun.serve` could not bind the token-verifier tests' ephemeral localhost sockets
(`EPERM`), and teardown consequently tried to stop an undefined server. The same owning target
was rerun with socket permission and passed **95 tests in 7 files** with 251 assertions. The
focused shared-store control passed **11 tests** with 29 assertions inside the sandbox.

Section 1 adds two OAuth cases and strengthens the existing matched-callback replay case. The
whole MCP target now passes **116 tests in 10 files** with 468 assertions. The focused OAuth
file passes **26 tests** with 110 assertions.

### Failure proofs

| Check                                                             | Injected fault                                                             | Observed failure                                                                                                                                    |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wrong state preserves the honest MCP login and browser cookie`   | Baseline delete-before-compare behavior                                    | Red first: after the forged response was applied to the cookie jar, the retained cookie was `undefined` instead of `__Host-wbs_mcp_oauth=random-2`. |
| same route-level test                                             | Move `transactions.delete(binding)` before the state comparison            | The later honest callback returned **400**, expected **302**; upstream exchange remained unavailable to the success assertion.                      |
| same route-level test                                             | Add `clearCookie()` to the wrong-state response while retaining the record | Applying that response removed the browser binding, and the later honest callback returned **400**, expected **302**.                               |
| `expires before mismatch and clears the dead browser transaction` | Compare state before checking expiry                                       | Exact retained transaction count was **1**, expected **0**.                                                                                         |
| `binds PKCE to a one-use upstream browser round trip`             | Omit matched-state deletion                                                | Exact upstream exchange count was **2**, expected **1**, after the second matching callback.                                                        |

Each mutation was restored before the green runs. The browser helper applies the handler's
single `Set-Cookie` field, including `Max-Age=0`, so the honest callback depends on the cookie
state a browser would actually carry rather than on a private-map-only assertion.

## Commands

| Command                                                                                                               | Result                                                    |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `bun test apps/mcp-01/src/oauth.test.ts --test-name-pattern 'wrong state\|expires before mismatch\|one-use upstream'` | 3 passed, 0 failed, 26 assertions                         |
| `bun test apps/mcp-01/src/oauth.test.ts`                                                                              | 26 passed, 0 failed, 110 assertions                       |
| `bun test --coverage --coverage-reporter=lcov` from `apps/mcp-01`                                                     | 116 passed, 0 failed, 468 assertions, 10 files            |
| `bun test libs/auth/src/oidc-store.test.ts`                                                                           | 11 passed, 0 failed, 29 assertions                        |
| `bun test --coverage --coverage-reporter=lcov` from `libs/auth`, with localhost socket permission                     | 95 passed, 0 failed, 251 assertions, 7 files              |
| `bunx eslint apps/mcp-01/src libs/auth/src`                                                                           | clean, exit 0                                             |
| `bunx tsc --build --force apps/mcp-01/tsconfig.json libs/auth/tsconfig.json`                                          | clean, exit 0                                             |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate mcp-oidc-store --strict --json`                        | valid, 1 passed, 0 failed                                 |
| `bunx prettier --check` over the four changed files                                                                   | clean, exit 0                                             |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx format:check --all --output-style=static`                           | clean, exit 0                                             |
| `git diff --check`                                                                                                    | clean, exit 0                                             |
| `bin/h2puni-gate.sh <section-1 SHA>`                                                                                  | unavailable, exit 70: `/home/puni1/.cache` does not exist |

The focused and whole MCP results above were rerun against the final test behavior. The auth
implementation is unchanged by Section 1; its focused and whole owning results are recorded from
this worktree.

The locked h2puni gate did not begin a checkout or any constituent check because this host lacks
the gate's required `/home/puni1/.cache` lock directory. No gate success is claimed.
