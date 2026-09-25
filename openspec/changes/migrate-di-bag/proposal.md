## Why

The repository pins `di-bag` 0.4.0; the registry carries 0.5.0, a breaking release that renames
almost every public name, removes the `di-bag/node` entry, renames the close options
(`waitTimeoutMs`, `abortSignal`) and the disposal fields (`disposalPromise`), and replaces 42
runtime error codes with 32. Twenty sealed modules, the backend's composition root, the frontend's
three runtimes and the lifetime slot all compose through it.

## What Changes

**Composition library**

- From: `di-bag` 0.4.0, its builder, provider and module names, and `di-bag/node`.
- To: `di-bag` 0.5.0, every caller moved by the library's own codemod plus a residual edit for
  what the codemod cannot see (calls behind casts, message assertions, non-literal close options).
- Impact: internal. No HTTP, WebSocket or MCP response changes.

**Operator-visible failures**

- From: a module that is missing a requirement or resolved from outside answers
  `DI_BAG_MISSING_REGISTRATION`; a failed disposal is `DiBagCleanupError`.
- To: `DI_BAG_UNKNOWN_SERVICE_KEY` and `DiBagDisposalError`, each message ending in a link to the
  library's errors page. `DI_BAG_MISSING_DEPENDENCY` and the module labels are unchanged.
- Impact: contractual for anything that matches di-bag's codes in logs.

**Lifetime budgets**

- From: the lifetime slot's `{ timeoutMs }` passed straight to a DI Bag close.
- To: the slot keeps `timeoutMs`; the one transaction that owns a built graph hands it to DI Bag
  as `waitTimeoutMs`, and a test proves the budget arrives.

## Non-Goals

No label-agreement change: 0.5.0 still exposes a module's label only as the prefix of its private
bindings' names, so WBS 040.13 stays open. No new module, lifetime or runtime. No
`di-bag-codemod` dependency: it runs once through `bunx` and is not pinned in the manifest.

## Constraints

Exact pin through Bun, one lockfile edit, one green commit for the move. Every changed safety
check carries a watched production-path negative under R5, and the recorded sabotages of the
modules, the lifetimes and the model tests are observed again on 0.5.0.

## Capabilities

### New Capabilities

- `di-bag-library`: The composition library is one exact release, reached from one entry point,
  and a lifetime's close budget reaches the library's own wait.

### Modified Capabilities

None.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

`package.json`, `bun.lock`, the sealed modules under `libs/wbs/application/core/src/module` and
`apps/wbs/be-01/src/module`, `apps/wbs/be-01/src/boot.ts`, the frontend runtimes and modules
under `apps/wbs/fe-01/src`, the browser probes, and the pins and label suites in
`tools/tool-devsync`.
