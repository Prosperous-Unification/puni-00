<!--
Commands, their output, and the failure-proof table R5 asks for.
-->

## Commands

Run on the Linux laptop, on `fix/wbs-local-activated-org`, every Bun test with
`env -u CLAUDECODE`, one heavy target at a time. Second round after the Fable review of #716.

| Command                                                                                          | Result                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `nx run-many -t typecheck -p wbs-auth wbs-core wbs-be-01 wbs-gw-01 wbs-mcp-01 --skip-nx-cache`   | succeeded                                                                                                                     |
| `nx run-many -t lint -p wbs-auth wbs-core wbs-be-01 wbs-gw-01 --skip-nx-cache`                   | succeeded                                                                                                                     |
| `nx run wbs-auth:test`, `wbs-core:test`, `wbs-gw-01:test`, `wbs-mcp-01:test` (`--skip-nx-cache`) | 125, 1326, 154, 517 pass; 0 fail each                                                                                         |
| `nx run wbs-be-01:test --skip-nx-cache`                                                          | 3446 pass, 3 skip, 1 fail: `test-tiers` (the dev-server smoke test was named `.db.test.ts` without opening a database itself) |
| be-01 `test-tiers` and `dev/activated-organization-server.test.ts`, after renaming it            | 4 pass, 0 fail                                                                                                                |
| `bunx openspec validate --all --json`                                                            | 284 passed, 0 failed                                                                                                          |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`      | exit 0                                                                                                                        |

The first round's full be-01 run (3440 pass, 1 fail, the old-order assertion in `boot.db.test.ts`)
is superseded by the run above.

**The dev server, run.** `ss -ltn` lists it on `127.0.0.1:<port>`; `localhost` still reaches it
from curl and Bun (both fall back from `::1`). The first round's end-to-end run (agent key 200,
malformed key 401, gw-01 WebSocket opened by the native cookie) is unchanged by this round; the
smoke test now logs in, selects `org-local` and reads `/api/people` on every run.

**Dev keeps booting.** On h2puni, a command printing only the scheme of
`AUTH_ISSUER_DISCOVERY_URL` in `/home/puni1/wbs-dev/oidc-dev.env` and in the `wbs-dev-src`
container's environment printed `https` for both.

### Not run, and why

- `bin/h2puni-gate.sh`: the brief asks for a PR; CI runs the full gate.
- fe-01 tests and the browser flow: fe-01 is unchanged.
- Prod's issuer scheme: `/home/puni1/wbs/oidc.env` was not readable over the `h2puni` alias.

## R5 proofs

| Check                                                    | Injected fault                                            | Observed                                                                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `issuerUrlFromEnv` scheme refusal                        | the `https:` comparison never true                        | `main.ts refuses a non-HTTPS OIDC issuer` failed; gw-01 `refuses an issuer discovery could never reach at boot` saw `loadConfig` return |
| `issuerUrlFromEnv` parse refusal                         | `URL.canParse` check removed                              | `main.ts refuses an unparsable OIDC issuer` failed: a bare `ERR_INVALID_URL` whose `input` carried the value                            |
| only well-known schemes named                            | `issuer.protocol` named unconditionally                   | `main.ts refuses a scheme-less OIDC issuer` found the host in the output                                                                |
| native session before OIDC (`authenticateOrRefuse`)      | `authentication.feature.ts` reverted to main              | `verifies a native session without reading the OIDC verifier` failed with `only requests to HTTPS are allowed`                          |
| native sessions only when password sessions are admitted | the condition made always true                            | `falls back from invalid OIDC only when password sessions are enabled` and `admits a password session as link proof…` failed            |
| credential evidence skips upstream for `first_party`     | the condition removed (written test first)                | `answers /api/projects 200…` and `answers /api/people 200…` received `[500, 500]`                                                       |
| discovery retried after a failure                        | the `??=` memoization (written test first)                | `discovers again once a failed discovery cools down` rethrew `discovery unavailable`                                                    |
| dev server on loopback only                              | Elysia's default `listen(port)`                           | the smoke test reached `/health` on the host's LAN address                                                                              |
| dev server cleans up a failed start                      | the catch's stop and `rmSync` removed                     | `deletes its database directory when it cannot start` found `wbs-activated-organization-*` left in the child's TMPDIR                   |
| production graph cannot reach the dev server             | `main.ts` importing `./dev/activated-organization-server` | `cannot reach the activated organization development server` failed listing both markers                                                |

The credential-evidence change cannot widen who authenticates: `first_party` is set only by
`nativeSessionUser` (HS256 on the JWT key), the OIDC verifier accepts RS256 only, and the skip
can only replace upstream evidence with `verifyNative`, which re-verifies and binds the token or
answers null.
