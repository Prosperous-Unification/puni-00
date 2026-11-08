# Task 9.2 bounded persisted successor browser acceptance

Based exactly on `4ab3b9d9a`, isolated worktree `/tmp/puni-successor-browser`, branch `task92-successor-browser`. This packet accepts the existing local successor editor through browser, HTTP and SQLite. Parent 9.2 remains unchecked; production authoring remains inactive.

## Accepted boundary

Independent `SuccessorDesktop` and `SuccessorPhone` projects preserve the predecessor fixtures and seed two successor-owned external relationships: remote node → local node for desktop, remote node → local whole for phone. Browser gestures change desktop node → whole and phone whole → node without changing the predecessor coordinate or relationship ID. The phone sends the local compact node coordinate with its actual row and step UUIDs.

Each case checks the initial selector, chosen complete tuple, exact successor-owner command URL and `updateTypedDependency` payload, HTTP 200 and complete accepted response. Save must close the dialog and cause an authoritative tree read whose sequence is installed. Reload/reopen must retain the selected tuple. A fixture-only SQLite projection checks the exact ID, organization, both project/row/scope/step coordinates and FS type, excluding audit timestamps.

The fixture retains its explicit `syntheticExternalCommands: true` seam. This changes no production authoring policy. The dormant control proves no enabled external semantics, HTTP409 refusal and rollback of an earlier local command in production composition.

## Watched faults

Desktop `plan-columns/depends.tsx` and phone `plan-cards.tsx` were independently changed only at their persisted relationship update sites: selected `serializeDependencyEndpoint(target, owner)` became `serializePersistedDependencyEndpoint(dependency.successor, owner)`. Each source was restored in `finally` before the other fault. Each accepted Save, installed the authoritative refetch and reloaded, then failed the reopened `This work item` selector assertion:

- Desktop expected whole/null; received original node/step: one failed, exit 1.
- Phone expected node/step; received original whole/null: one failed, exit 1.

The adjacent `Proof:` comment names these faults. [Mutation commands](evidence/successor-scope-browser/mutations.json), [desktop failure](evidence/successor-scope-browser/desktop-negative.log), [phone failure](evidence/successor-scope-browser/phone-negative.log). Product implementation diffs are empty after restoration.

## Verification

Commands run from the isolated repository root, with the feature worktree's existing locked `node_modules` symlink; no install or dependency changes. Configured Nx commands use `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` and `--skip-nx-cache`.

- Configured browser: `bunx nx run wbs-fe-01:e2e-cross-project --skip-nx-cache`: exit 0, **5 passed in 48.0 seconds**; [final receipt](evidence/successor-scope-browser/browser-final.log). All five cases include unchanged refresh/reconnect and predecessor acceptance plus both successor cases.
- `bunx nx run wbs-fe-01:typecheck --skip-nx-cache`: exit 0, including module prerequisites. [Receipt](evidence/successor-scope-browser/frontend-typecheck.log).
- `bunx nx run wbs-be-01:typecheck --skip-nx-cache`: exit 0, including module prerequisites. [Receipt](evidence/successor-scope-browser/backend-typecheck.log).
- `bunx eslint apps/wbs/be-01/src/testing/cross-project-browser-server.ts apps/wbs/fe-01/e2e/cross-project-refresh.real.spec.ts`: exit 0, silent success. File-scoped formatting and `git diff --check` are also recorded in [static checks](evidence/successor-scope-browser/static.log).
- `bun test apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts --test-name-pattern 'mounted external authoring stays dormant'`: 1 pass, 128 filtered, 0 fail, 13 assertions. [Receipt](evidence/successor-scope-browser/dormant.log).
- `bunx openspec validate --all --json`: exit 0, 274 passed / 0 failed, including this change. Existing informational warnings remain. [Summary](evidence/successor-scope-browser/openspec-summary.json).

An initial sandbox browser run exited before assertions without diagnostics; the successful browser and mutation runs use the authorized localhost-capable execution boundary. An initial mutation script stopped before edits because it found both manual and persisted update sites; subsequent mutations target only the persisted site. Earlier mutation runs were repeated with the final spec held stable so source locations in the retained receipts match the assertions.

On integrated feature head `36703313d8f2dda11b2045f09f9ec0d89b23ef27`, the
configured `wbs-fe-01:e2e-cross-project` target reran uncached: **5/5 passed in
50.3 seconds**, including both successor-scope cases. The affected
`tool-remote-scripts` configured lint/typecheck targets also passed uncached;
OpenSpec validation remained **274/274**. This local integrated run does not
substitute for the exact-SHA h2puni gate or CI on a pushed candidate.

## Limits

Only these two transitions establish browser/database acceptance. No full frontend suite/build, full lint, host gate, deployment, push, merge or activation was run. No backend access/history breadth or other endpoint scopes are claimed. The fixture uses ordinary production runtime/HTTP/organization composition but is not a signed-in router/login acceptance test. Shared disk capacity constrained checks to the configured browser and scoped static/control checks. Parent 9.2 and release acceptance remain open.
