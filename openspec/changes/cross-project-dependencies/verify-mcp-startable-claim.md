# Generated MCP startable and claim acceptance (2026-10-23)

Bounded Task 6.3 acceptance on base `b89a74115`. The production predicates,
transport implementation, skip policy and activation capability are unchanged.

`connected-command-parity.test.ts` now calls the actual generated MCP tools via
SDK Client/InMemoryTransport, production server/HTTP forwarding, and the existing
composed backend child with real machine-key authentication. Six cases cover
local and remote node FS, SS and FF relationships. Setup, relationship writes,
predecessor milestones, startable reads and claim writes use generated tools.

- FS/SS startable permissions disclose the authored blocker and exclude the target;
  a governed claim refuses until completion (FS) or actual attempt start (SS).
- FF permits starting and discloses the exact unmet finish blocker and relationship ID.
- Once the first step is permitted, omitted whole-leaf selection and explicit
  mixed permitted/blocked steps both refuse atomically, including rollback of an
  earlier patch. Every durable table and every captured push equals its snapshot.
- Correcting selection to the advertised first step succeeds. HTTP/MCP payload
  equality, forwarded owner URL/body and durable claim identity preserve project,
  work item, step, person and claim ID through the generated boundary.

This does not duplicate the backend's exhaustive admission/replay matrix. Only
`claimWorkItem` and new-statement replay remain governed; historical attempts and
manual corrections retain the existing observation policy. This packet adds no
production guard and changes no skip-policy behavior.

## Commands and observed results

Commands ran in isolated `/tmp/puni-mcp-claim-acceptance` on local host `pop-os`,
using Bun 1.4.2 and the existing workspace dependency tree via an untracked
`node_modules` symlink. No frozen install was performed in this clone.

- `bun test apps/wbs/mcp-01/src/connected-command-parity.test.ts
--test-name-pattern 'startable permission'`: **6 passed, 0 failed, 236 assertions**,
  75 existing cases filtered out; restored production path, 42.38 seconds.
- `bunx tsc --build --force apps/wbs/mcp-01/tsconfig.json`: exit 0 after correcting
  the new test's two initial declaration errors.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-mcp-01:lint
--skip-nx-cache`: exit 0, configured full MCP source lint, 24.6 seconds;
  no module-boundary skip warning.

## Watched independent transport fault

Temporarily replaced only the final `return text(bodyText)` in production
`wbs-client.ts` with a startable-specific JSON rewrite setting `prerequisites: []`.
Backend execution/read logic, generated schemas, HTTP replies and test assertions
were untouched. The same focused command produced **0 passed, 6 failed** with
30 assertions, 36.54 seconds. Each failed the direct-HTTP/MCP payload equality
because the transport erased the required permission disclosure. The original
production file was restored byte-for-byte (`git diff` empty), then the complete
six-case command passed as recorded above. An adjacent `Proof:` comment names
this injected fault in the acceptance test. Local logs remain at
`/tmp/mcp-claim-transport-red.log` and `/tmp/mcp-claim-restored-green.log`.

## Limits and pending checks

The first unprivileged attempt failed before backend readiness because loopback
`listen` returned EPERM; the successful and fault runs used approved socket
access. An initial direct ESLint/Nx attempt skipped module-boundary checking due
to unavailable sandbox sockets; the configured lint command above supersedes it.

The full existing 81-case connected-command suite, full backend suite, complete
MCP test target, full builds, frozen install, strict integrated OpenSpec validation
and h2/h4 exact-SHA host gate were not run. No h1claw builds/tests, raw full h2
gates, live activation, external-service actions or production deployment ran.
Independent review and an integrated exact-SHA gate remain required before
closing the parent task.
