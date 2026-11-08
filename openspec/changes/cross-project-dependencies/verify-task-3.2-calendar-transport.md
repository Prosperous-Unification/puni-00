# Task 3.2 bounded calendar transport proof — 2026-10-23

Base: `3cb4fb8a4`. Worktree: `/tmp/puni-transport-outcomes-32`.
This packet adds tests only; task 3.2 remains open. Production authoring and
activation remain dormant.

## Coverage

`apps/wbs/mcp-01/src/connected-command-parity.test.ts` now exercises two
external-authoring transports (mounted HTTP and MCP generated from the shared
HTTP document) against the existing composed SQLite backend subprocess. The
fixture uses real machine-key authentication and its existing synthetic active
external-command seam. It does not use delegated OAuth.

Each calendar case commits a whole FS external dependency through its named
transport, proves the real successor placement is initially 2→4, and clears the
predecessor's anchor through public `PATCH /api/projects/:id`. It then reads
both endpoint projects through mounted HTTP and generated MCP. Exact body
parity retains the producer's `dependency_calendar_missing` project identity
and name, incident relationship and stable endpoint IDs, empty slices and null
row forecasts. The reads preserve every persisted table and push list compared
with the post-PATCH snapshot. Neither the relationship nor an unavailable
response is seeded or supplied by a fake producer.

The two optimization controls also commit through their named transport, then
request `{ optimizationEnabled: true, scheduleEngine: 'optimized' }` for the
predecessor through public HTTP and generated MCP PATCH. Both reject with
`409 { "error": "optimizer_unavailable" }`; MCP reports
`HTTP 409 optimizer_unavailable`. Every persisted table and push list remains
unchanged, and the successor retains its real Fast placement at 2→4.

This refusal is expected configuration admission: `ProjectService.update`
calls `turnsTheOptimizerOn` and checks `optimizerAvailable()` before writing.
The composed backend's default has `withOptimizer = false`. An initial attempt
to expect a successful optimization settings PATCH failed on this exact 409;
no optimized state was injected to force a connected outcome. Thus the packet
proves optimizer admission refusal transport, not a connected optimization
stage, terminal solver outcome or required-engine-unavailable tree.

## Watched transport negative

Temporarily changed the successful return in production
`apps/wbs/mcp-01/src/wbs-client.ts` from `text(bodyText)` to
`text(bodyText.replace(/\"scheduleError\":\{[^}]*\}\]\},?/, ''))`.
This fault drops the complete missing-calendar field only after the actual HTTP
response reaches MCP. Ran:

```sh
bun test apps/wbs/mcp-01/src/connected-command-parity.test.ts --test-name-pattern 'propagates real calendar'
```

Observed 0 passed, 2 failed, 64 filtered, 14 assertions (27.74s). Both cases
failed the exact MCP/HTTP tree equality assertion: HTTP retained
`dependency_calendar_missing` with abbreviation, name and project ID; MCP
omitted `scheduleError`. Restored the production file byte-for-byte before
verification. The adjacent `Proof:` comment records this observed mutation.
No production safety check was added or changed.

## Final verification

```sh
bun test apps/wbs/mcp-01/src/connected-command-parity.test.ts --test-name-pattern 'propagates real calendar|real optimizer admission'
```

4 passed, 0 failed, 62 filtered, 44 assertions; 41.19s. Mounted runs required
approved local loopback access. The initial sandbox run failed with
`EPERM listen` before reaching application assertions; it is not a behavior
negative.

```sh
NX_DAEMON=false bunx nx run wbs-mcp-01:lint
NX_DAEMON=false bunx nx run wbs-mcp-01:typecheck
```

Both configured targets passed uncached: lint 47.6s, typecheck 10.6s. Nx reported
denied worker sockets and used its documented in-process plugin fallback.
Changed-file Prettier and `git diff --check` passed.
`OPENSPEC_TELEMETRY=0 node_modules/.bin/openspec validate --all --json`
passed all 271 items (253 changes, 18 specs), exit 0.

Not run: full MCP suite, backend configured suite/lint/typecheck, repository
build, canonical host gate, CI, browser or installed solver/Python/image
acceptance. No push, deployment, production activation or parent-checkbox
closure was performed. Active delegated OAuth external success and actual
connected optimization outcomes remain uncovered intersections requiring
separate acceptance and independent review.
