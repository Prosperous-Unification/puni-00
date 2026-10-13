# Verification Report

**Change**: `align-mcp-resource-body-limit`  
**Verified at**: 2026-10-13  
**Verifier**: isolated implementation worker, Linux amd64

## Structural validation

`BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0:

```json
{
  "totals": { "items": 187, "passed": 187, "failed": 0 },
  "byType": {
    "change": { "items": 169, "passed": 169, "failed": 0 },
    "spec": { "items": 18, "passed": 18, "failed": 0 }
  }
}
```

All five implementation tasks are complete. The three requirements map to the exact and fallback handlers in both production configurations, the real Caddy suite, and the existing exposure/discovery unit tests. No design.md was needed: the production change adds one exact handler using the existing reverse proxy; the remaining technical shape is test wiring. Domain terms and ADRs were unnecessary. The delta `mcp-edge-body-limit` remains pending sync until archive.

## Reproduction and byte evidence

A clearly synthetic equivalent of a notes JSON-RPC call uses 62,467 newline note UTF-8 bytes. JSON escaping and envelope produce **125,046 serialized UTF-8 body bytes**; Bun fetch sends that string as the HTTP body. This is not a reconstruction of private WBS 080.39 content and does not assert the real incident request had this size. The old candidate and old swap-rendered config each answered **413**, failing the expected-200 assertion before the fix. Four config unit tests also failed before implementation.

With the fix, both production configuration paths run through actual Caddy 2.10.2:

| Path                  |   Admitted body bytes | Rejected body bytes | Rejection                  |
| --------------------- | --------------------: | ------------------: | -------------------------- |
| `/mcp`                | 125,046 and 4,194,304 |           4,194,305 | 413, write state unchanged |
| `/mcp/oauth/register` |                64,000 |              64,001 | 413, write state unchanged |
| `/mcp/oauth/token`    |                64,000 |              64,001 | 413, write state unchanged |
| `/mcp/`, `/mcpx`      |                64,000 |              64,001 | 413, write state unchanged |

Caddy's existing `64KB` means 64,000 bytes. Tests replace only deployment addresses and the logging snippet; the upstream is a JSON-reading synthetic write recorder, not live WBS or the authentication authority. A synthetic bearer header represents an authenticated client. The existing real MCP SDK boundary test separately passed at exact 4MiB and one byte over. Chunked-transfer variants and live incident replay were not tested.

## Failure proofs

Every fault below was injected separately into the isolated production input, observed failing, then restored. Native Caddy was used for mutation speed; the restored suite also passed through the pinned Docker image. The suite name is `<candidate|swap-rendered> through real Caddy > enforces resource and anonymous boundaries without rejected upstream writes`.

| Check                                  | Injected fault                                     | Observed test failure                                                     |
| -------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| Exact resource allowance, both configs | Restore exact cap to `64KB`                        | Both suites: expected 200, received 413                                   |
| Exact resource ceiling, both configs   | Remove `max_size 4194304`                          | Both suites: expected 413, received 200                                   |
| Exact resource ceiling, both configs   | Raise exact cap to 8MiB                            | Both suites: expected 413, received 200                                   |
| Anonymous ceiling, both configs        | Raise fallback cap to 4MiB                         | Both suites: expected 413, received 200                                   |
| Config parity                          | Change candidate only; restore renderer to old cap | Candidate passes; swap suite expected 200, received 413                   |
| Source overwrite, both configs         | Remove `header_up X-Forwarded-For {remote_host}`   | Both suites: expected `127.0.0.1`, got spoofed `203.0.113.123, 127.0.0.1` |
| Required integration dependency        | Remove `test:caddy` from `test.dependsOn`          | `caddy-target.test.ts`: expected dependency, received empty array         |
| CI Docker requirement                  | Remove CI override guard                           | `caddy-target.test.ts` CI override negative fails                         |
| Required native development tool       | Remove absent-binary guard                         | `caddy-target.test.ts` absent-binary negative fails                       |
| Required Docker image preparation      | Remove failed-pull refusal                         | `caddy-target.test.ts` Docker exit-17 negative fails                      |

Forwarding proof config explicitly trusts loopback globally, exercising the existing promise that the source overwrite survives future `trusted_proxies` configuration. Without that global fault Caddy's defaults already ignore untrusted caller headers. The test verifies the header received by the upstream, not a regex alone.

The production runner also exited 1 when invoked with `MCP_CADDY_BINARY=/missing-caddy` and when `CI=1` carried a native override. It never silently skips a required dependency. Absence and unreadability are not separately modeled by this change.

## Local checks

Commands ran from `/tmp/puni-mcp-body-limit`, based on exact merged main `0ea6a1166242edf694294d1ed6e715fb7e1aed60`.

- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: exit 0, checked 1,573 installs across 1,447 packages, no changes.
- Final focused candidate/renderer/required-runner Bun tests: 30 pass, 0 fail, 76 assertions.
- `bun test apps/wbs/mcp-01/src/http.test.ts -t 'refuses a tool call one byte over'`: 1 pass, 11 filtered, 0 fail.
- Required `CI=1 ... bunx nx run-many -t test -p tool-compose,tool-remote-scripts --parallel=2 --skip-nx-cache --output-style=stream`: exit 0. Tool-remote-scripts: 393 pass, 2 pre-existing skips, 0 fail across 30 files before the three additional runner negatives; the final runner file separately passed all four tests. The skipped real solver cleanup tests require their existing opt-in and are unrelated to MCP.
- Required pinned Docker Caddy path: 2 pass, 0 fail, 78 assertions. Image `caddy:2.10.2@sha256:d8c17a862962def15cde69863a3a463f25a2664942eafd7bdbf050e9c3116b83` (Linux amd64). Native Caddy development override also passed; CI refuses that override.
- Focused Nx lint, typecheck and build: exit 0 after correcting initial helper lint errors and an inferred environment type in the added runner negative; final lint/typecheck repeated after the correction.

Actual Nx completion output:

```text
NX   Successfully ran targets lint, typecheck, build for 2 projects and 2 tasks they depend on
Run duration: 5.1s
Cache: Skipped (--skip-nx-cache)

NX   Successfully ran target test for 2 projects and 1 task they depend on
Run duration: 1m 28s
Cache: Skipped (--skip-nx-cache)
```

The Caddy target is an uncached dependency of the existing required `tool-remote-scripts:test` target. It prepares the digest-pinned image before starting the timed tests. CI and h2puni require Docker and registry access; failure blocks the target. The suite uses temporary HTTP listeners, named disposable containers, no admin API, and stops each container on teardown. Native override is only for explicit local development.

## Remaining delivery checks

The full `bunx nx run-many -t test lint typecheck build` was not run locally; the requested scope assigns the canonical `bin/h2puni-gate.sh <exact-sha>` and CI to the parent after review. No h2puni gate, GitHub CI, live Caddy replacement/reload, or private notes replay has run. `BUN_TMPDIR=/tmp NX_DAEMON=false bunx nx format:check --all` exited 0 with no output on the final documentation tree. The final OpenSpec run again reported 187 passed and 0 failed. The verification report update itself was also checked with Prettier. No push or PR is authorized in this worker task.

## Implementation signal

This isolated local branch will be committed before handoff. The parent receives the exact SHA and fresh clean-tree status. Exact-head review and the host/CI gate remain required before integration or archive.
