# Verify

## Commands

- `env -u CLAUDECODE bunx nx run-many -t lint:fast typecheck test -p wbs-mcp-01 --skip-nx-cache`:
  all three targets passed on 2026-09-27.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: 119 of 119 items passed.
- `bunx prettier --check` on every touched file: clean.
- A raw `bun test apps/wbs/mcp-01/src` reports 13 failures both with and without this change
  (the isolated timing-safe process test needs the project's test target); the Nx target passes.

## Proof negatives (observed 2026-09-27)

- `server.ts` refresh catch: removing the unexpected-cause assignment failed `reports a refresh
whose session lookup throws, and keeps the session` (`Expected length: 1`, `Received length: 0`).
  Reporting every refresh rejection failed `keeps a refused refresh modeled`.
- `server.ts` session end: awaiting `endSession` outside its `try` failed `reports a session end
that rejects instead of failing the protocol call` with `MCP error -32603` carrying the store
  message to the client.
- `oauth.ts`: a plain `Error` for the missing family, or `UpstreamRefreshRefused` extending
  `Error`, each failed `refuses a tool-call refresh of an ended or unrefreshable session as a
session outcome` on `toBeInstanceOf(SessionRefreshRefused)`.
- `oauth.ts` refresh catch: mapping every non-refused failure to `EdgeGate` failed `rejects a
tool-call refresh with a store failure during the lease, not an edge outcome`; throwing a plain
  `Error` for an incomplete provider refresh failed `keeps a transient provider refresh failure an
edge-gate outcome of a tool-call refresh`.
- `main.test.ts`: against the previous `server.ts`, the lookup case wrote no operator record and
  the session-end case rejected with `MCP error -32603` carrying the unredacted Basic credential.

## Host gate

Recorded in the pull request.
