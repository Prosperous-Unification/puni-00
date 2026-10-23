# Task 4.2 bounded real OAuth consent queue acceptance — 2026-10-23

Base: `c650ee632`. This packet adds three acceptance cases to
`apps/wbs/mcp-01/src/organization-delegation.boot.test.ts` and test-only controls
to its booted backend. No production authority predicate changes. Task 4.2 and
production external-authoring activation remain open.

## Reconciliation and scope

The existing direct-runner credential matrix covers persisted consent source,
revocation, identity, organization, audience and family predicates. Mounted HTTP
covers queued browser revocation; the generated MCP packet in
[active MCP authority](verify-active-mcp-authority.md) covers queued machine-key
revocation and successor restriction. Existing real OAuth cases cover consent,
agent identity, refresh, revocation before the next request, and active whole,
node and descendant endpoints. This packet exercises the remaining distinct race:
a real consent credential changes after request admission while its external
command waits for the process writer. It does not duplicate the scope matrix.

Every case creates a fresh account-bound agent and calls the real
`connect('auth0|dany', { agent })` consent flow. Generated
`postApiProjectsByIdCommands` calls create an external whole FS relationship,
then queue a two-command batch: a local rename followed by an FS-to-SS update
of the same relationship identity. The unchanged-authority control commits both
changes and publishes. The other cases independently revoke the persisted
consent credential or change only its `mcp_family_id` through a separate SQLite
connection. Each retained operation returns exactly HTTP 409
`{ "error": "organization_context_changed" }` through MCP.

The process fixture observes the real source through `BootedBrowserProcess.open`.
It wraps the real `organizations.resolve` only in the test process, awaits its
resolution, then queues a held writer before returning admission. This ordering
allows real delegation verification and its single-use `delegation_use` write to
finish on the same coordinator. The next real `gate.enter` enqueues the command
without replacing its callback; only then does the independent connection mutate
the credential. Cleanup releases the held writer even on test failure or shutdown.

Refusal snapshots are taken after admission and the independent credential
mutation. They compare every application table discovered through `sqlite_master`
and a separate real-announcement publication count. This includes endpoint and
project revisions, relationship contents, journal/history, events and their
sequencer. The preceding local rename and FS-to-SS update leave no durable trace
on either refusal. Admission's already-consumed delegation is included in the
baseline rather than incorrectly treated as a command write.

## Watched production-path negatives

| Independent injected production fault                                                            | Observed failure                                                                                               | Receipt                                                                    |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Replace the command runner's `scope.resolveAccess(caller)` with captured `caller.expectedAccess` | Both queued consent revocation and family cases receive unsafe MCP success (`isError: false`); 27 pass, 2 fail | [captured-access.log](evidence/oauth-queued-authority/captured-access.log) |
| Remove only `credential.mcpFamilyId !== context.grant` in `SqliteCommandAccess`                  | Queued consent family mismatch receives unsafe MCP success; revocation still refuses; 28 pass, 1 fail          | [family.log](evidence/oauth-queued-authority/family.log)                   |

Each injection ran the full shared-order boot file and restored the production
file in `finally` before the next command. Neither fault is committed. The
adjacent test `Proof:` comment names both observed faults. These tests verify
existing production predicates; no new production implementation was needed.

## Verification and limits

```sh
bun test apps/wbs/mcp-01/src/organization-delegation.boot.test.ts
```

Restored run: **29 pass, 0 fail, 850 assertions**, including all three new cases.
[Receipt](evidence/oauth-queued-authority/restored.log). The entire file is the
bounded selection because its existing cases share activation and session state
in order. The loopback JWKS/backend sockets require sandbox escalation; an initial
sandbox run failed with `EPERM listen` and is not behavioral evidence. An initial
fixture attempt repeated the existing one-time synthetic activation and failed its
unique receipt constraint; the corrected tests reuse the suite's active setup.

`NX_DAEMON=false bunx --no-install nx run-many -t lint typecheck -p wbs-mcp-01 wbs-be-01 --parallel=1`
passed backend lint and both typechecks; MCP lint exposed two new success-control
assertions passing Bun's `any`-typed `expect.objectContaining` into a typed matcher.
[Initial configured receipt](evidence/oauth-queued-authority/configured.log).
The assertions now locate the typed row and use `toMatchObject` directly.
`NX_DAEMON=false bunx --no-install nx run wbs-mcp-01:lint --output-style=static`
then passes with zero cache hits
([receipt](evidence/oauth-queued-authority/lint-restored.log)).
The final MCP `bunx --no-install tsc --build --force apps/wbs/mcp-01/tsconfig.json`
also exits 0 ([receipt](evidence/oauth-queued-authority/types-final.log)).
Nx reports denied plugin sockets and uses its documented in-process fallback;
its generated ProjectGraph is present for module-boundary lint.

OpenSpec `bunx --no-install openspec validate --all --json` passes all **274 items**
(256 changes, 18 specs), exit 0
([CLI summary](evidence/oauth-queued-authority/openspec-summary.json)). Changed-file Prettier
and whitespace checks pass. Full MCP/backend suites,
Docker/build, canonical integrated host gate, browser, push, merge and production
activation are not run by this packet. The coordinator owns integrated acceptance
and review; Task 4.2 remains unchecked.
