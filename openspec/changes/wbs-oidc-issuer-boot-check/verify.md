<!--
Commands, their output, and the failure-proof table R5 asks for.
-->

## Commands

Run on the Linux laptop, on `fix/wbs-local-activated-org` off `24602e8d6`, every Bun test with
`env -u CLAUDECODE`, one heavy target at a time.

| Command                                                                                                          | Result                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nx run-many -t typecheck -p wbs-auth wbs-core wbs-be-01 wbs-gw-01`; `nx run wbs-mcp-01:typecheck`               | succeeded                                                                                                                                                                              |
| `nx run-many -t lint -p wbs-auth wbs-core wbs-be-01 wbs-gw-01`                                                   | succeeded                                                                                                                                                                              |
| `nx run wbs-auth:test`, `wbs-core:test`, `wbs-gw-01:test`, `wbs-mcp-01:test` (`--skip-nx-cache`)                 | 124, 1326, 154 and 517 tests; each succeeded                                                                                                                                           |
| `nx run wbs-be-01:test --skip-nx-cache`                                                                          | 3440 pass, 3 skip, 1 fail: `keeps boot verifier outages as 500 with password login true`, which asserted the old order. Rewritten (below) as the mounted proof of the intended change. |
| `bun test boot.db oidc-issuer-startup auth-service-null-password production-entrypoint` (be-01), after rewriting | 49 pass, 0 fail                                                                                                                                                                        |
| `bunx openspec validate --all --json`                                                                            | 284 passed, 0 failed                                                                                                                                                                   |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                      | exit 0                                                                                                                                                                                 |

**The documented local stack, run.** `activated-organization-server.ts --port 7310 --gw-url
http://localhost:7311 --app-origin http://localhost:7410`, and gw-01 with the documented env
(issuer `https://issuer.invalid`): both `/health` 200. As `owner`: login, `POST
/api/organization/active` (cookie set), `createPerson` agent, `patchPerson` binding it, a key
created (`wbs_mk_`, never printed). With that key `GET /api/people` and `GET /api/projects` 200;
a malformed key 401. A gw-01 WebSocket with the native cookie from the app origin opened and got
a presence frame. On SIGINT the server stopped and deleted its database directory. fe-01 was not
started here; its command is the one `playwright.organization.config.ts` runs.

**Dev keeps booting.** On h2puni, a command printing only the scheme of
`AUTH_ISSUER_DISCOVERY_URL` in `/home/puni1/wbs-dev/oidc-dev.env` and in the `wbs-dev-src`
container's environment printed `https` for both.

### Not run, and why

- `bin/h2puni-gate.sh`: the brief asks for a PR; CI runs the full gate.
- fe-01 tests: fe-01 is unchanged.
- Prod's issuer scheme: `/home/puni1/wbs/oidc.env` was not readable over the `h2puni` alias.

## R5 proofs

| Check                                                    | Injected fault                                      | Observed                                                                                                                                                                                                   |
| -------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issuerUrlFromEnv` scheme refusal                        | the `https:` comparison never true                  | `main.ts refuses a non-HTTPS OIDC issuer` failed (boot passed the composition, failed later on the unmigrated file); gw-01 `refuses an issuer discovery could never reach at boot` saw `loadConfig` return |
| `issuerUrlFromEnv` parse refusal                         | `URL.canParse` check removed                        | `main.ts refuses an unparsable OIDC issuer` failed: a bare `ERR_INVALID_URL` whose `input` carried the value                                                                                               |
| native session before OIDC (`authenticateOrRefuse`)      | `authentication.feature.ts` reverted to main        | `verifies a native session without reading the OIDC verifier` failed with `only requests to HTTPS are allowed`; mounted: the full be-01 run's `…password login true` answered 500, now asserted 200        |
| native sessions only when password sessions are admitted | the condition made always true                      | `falls back from invalid OIDC only when password sessions are enabled` and `admits a password session as link proof…` failed                                                                               |
| production graph cannot reach the dev server             | `main.ts` importing `activated-organization-server` | `cannot reach the activated organization development server` failed listing both markers                                                                                                                   |
