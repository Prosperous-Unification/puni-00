# Task 3.2 source reconciliation — 2026-10-23

The original audit below is historical. The [transport acceptance reconciliation](verify-task-3.2-closure.md)
supersedes its remaining-intersections assessment after the consented scope and
connected outcome packets were integrated. Task 4.2 authority acceptance and
Task 10 activation retain their own open obligations.

Audited feature commit `2ddea72eede2ea6ea5a843077bfaa3955cd031d3` in an
isolated worktree. No independently missing production transport behavior was
identified; this packet changes documentation only and leaves task 3.2 open.

## Existing implementation and fresh evidence

`commands/definitions.ts` declares endpoint `projectId`; `plan-command-shapes.ts`
derives the structural request union. `http/work-item-shapes.ts` binds that body
to `postApiProjectsByIdCommands`; core `http/work-item.routes.ts` parses and runs
the batch through organization admission. MCP derives its tools from the shared
document. Existing [node SS/FF evidence](verify-mcp-node-ss-ff.md) records the
bounded active fixture and watched production faults; they were not reinjected
for this documentation audit.

Commands below ran from the repository root against the audited commit, using
its existing dependencies through a `node_modules` symlink to the primary
checkout. Mounted MCP runs used approved local loopback access.

```sh
bun test libs/wbs/domain/contracts/src/http/plan-command-shapes.test.ts apps/wbs/be-01/src/controller/typed-dependency-commands.controller.db.test.ts
```

28 passed, 0 failed, 210 assertions; 9.55s.

```sh
bun test apps/wbs/mcp-01/src/organization-delegation.boot.test.ts
```

21 passed, 0 failed, 698 assertions; 23.39s.

```sh
bun test apps/wbs/mcp-01/src/connected-command-parity.test.ts --test-name-pattern 'commits whole FS|split node.*SS|split node.*FF'
```

2 passed, 46 filtered out, 0 failed, 29 assertions; 10.77s. Only the whole-FS
names matched this filter.

```sh
bun test apps/wbs/mcp-01/src/connected-command-parity.test.ts --test-name-pattern 'node split (SS|FF) preserves'
```

4 passed, 44 filtered out, 0 failed, 74 assertions; 32.66s.

The delegated suite freshly verifies ordinary dormant add/update refusal across
whole/node/descendant-step and FS/SS/FF, legacy dotted aliases, typed local stable
history, indexed malformed endpoint refusal, unsupported SF, and explicit empty
or surrounding-whitespace IDs. The synthetic active fixture verifies whole FS
and split-node SS/FF through HTTP and generated MCP with durable identities,
connected placement, journals and transport assertions.

## Remaining intersections

The audited active generated-MCP suite has no descendant-step success case.
Delegated OAuth covers dormant external refusal and local success/history, but
not active external success. Its active external successes assert
`scheduleError: null`; these suites do not establish external missing-calendar
or optimization-outcome parity. These are uncovered acceptance intersections,
not evidence that the shared shapes or route are absent.

Continue task 4.2's complete active admission/authority matrix and connected
runtime outcome acceptance, then reconcile task 3.2 against that evidence.
`core/src/compose.ts` still supplies `INACTIVE_EXTERNAL_DEPENDENCIES`; no
production authoring or activation was enabled. The whole checkbox cannot be
closed by this source audit alone.

The initial sandbox whole-FS run failed both selected cases because `Bun.serve`
received `EPERM listen`; the approved loopback rerun above passed. No production
code, safety checks or tests changed. No new R5 fault, full configured suite,
canonical host gate, CI, build, browser, Python/image, push or activation ran.

## Documentation checks

`OPENSPEC_TELEMETRY=0 node_modules/.bin/openspec validate --all --json`
passed all 271 items (253 changes, 18 specs), exit 0.
`OPENSPEC_TELEMETRY=0 node_modules/.bin/openspec validate cross-project-dependencies --strict --json`
exited 1 on 15 existing requirement-length warnings, with no error-level
issues; this packet edits no requirement text. Changed-file Prettier and
`git diff --check` passed.

## Later bounded evidence (2026-10-23)

The missing active descendant-step intersection now has [consented HTTP and
generated MCP acceptance](verify-task-3.2-consented-scope.md) with dotted
cross-project references, connected identity and all-table atomic refusal.
Separate [calendar](verify-task-3.2-calendar-transport.md) and
[optimization](verify-task-3.2-optimization-transport.md) packets cover
bounded transport outcomes. These later packets supersede the corresponding
gaps identified by the source audit above; they do not establish the entire
active authority/admission matrix or production activation. Task 3.2 stays
open pending that matrix and the exact-head gate.

The bounded [active generated MCP authority packet](verify-active-mcp-authority.md)
now adds restricted readable node SS add/FF update and queued machine credential
revocation/successor restriction. It reconciles prior HTTP/direct evidence and
leaves the full matrix, delegated race intersections and parent tasks open.
