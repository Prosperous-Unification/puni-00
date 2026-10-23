# Task 9.2 bounded persisted predecessor browser acceptance

Based on `14aea0957`, isolated clone `/tmp/predecessor-scope-acceptance`, branch `test/predecessor-scope-persistence`. This packet extends acceptance of the existing desktop/phone predecessor editor; it changes no product implementation, backend authoring policy, contracts or capability. Parent task 9.2 remains unchecked.

## Acceptance boundary

The configured `cross-project-refresh.real.spec.ts` now exercises desktop **node → whole** and phone **whole → node** on two separately seeded successor-owned external relationships. Both retain the same remote project/work-item identity. The phone selects the remote project's actual step UUID, while the local successor keeps the ordinary compact `sn1.<row UUID>.<step UUID>` command encoding.

The tests use real browser gestures, address candidates, command HTTP, composed production services, a real temporary SQLite database and the real gateway. The fixture entry now wires `httpProjectAddressApi` instead of the unit helper's deliberately refusing address client, provides explicit organization scope for these writes, and includes viewport metadata so mobile Chromium actually selects the phone renderer. Seed row IDs are UUIDs because the normal local node command parser validates that encoding. No extra remote step or replacement editor was needed.

The fixture explicitly enables only `OrganizationHarness.openComposedWith({ syntheticExternalCommands: true })`. Stored authority alone does not activate production authoring. The existing production dormant-authoring control remains unchanged and was rerun: **1 pass, 128 filtered, 13 assertions**. It proves capability observation still advertises no enabled semantics, external authoring still returns HTTP 409 `external_dependencies_inactive`, and an earlier local command is rolled back. [Control receipt](evidence/predecessor-scope-browser/predecessor-dormant.log).

Each case asserts the exact successor-owner command URL and `updateTypedDependency` payload, HTTP **200**, and the complete response `{ results: [{ index: 0 }], undoable: true, redoable: false }`. After Save, it waits for an authoritative tree read and its installed sequence, reloads the page, reopens the relationship and observes the selected predecessor tuple. A fixture-only SQLite readback then asserts the exact relationship ID, organization, both project/row/scope/step coordinates and type. The tuple projection deliberately excludes audit timestamps. These are accepted persistence assertions, rather than API-spy-only payload assertions.

## Watched negatives

After the natural positive passed, desktop `plan-columns/depends.tsx` and phone `plan-cards.tsx` were mutated **independently** to force their existing persisted-predecessor serialization branch instead of the newly selected source. Each mutation was restored in a Python `finally` block before the other ran. Both runs reached accepted Save, authoritative refetch and full reload/reopen, then failed the exact selected-coordinate assertion:

- Desktop expected `whole/null`, received the original `node/<remote step UUID>`: **1 failed**, exit **1**, 12.0 seconds.
- Phone expected `node/<remote step UUID>`, received the original `whole/null`: **1 failed**, exit **1**.

[Exact commands and exits](evidence/predecessor-scope-browser/predecessor-mutations.json), [desktop assertion](evidence/predecessor-scope-browser/predecessor-desktop-negative.log), [phone assertion](evidence/predecessor-scope-browser/predecessor-phone-negative.log). The adjacent test `Proof:` comment names these observed faults. Product source diffs are empty after restoration. Earlier selector, missing address-client/viewport/organization wiring, non-UUID seed and audit-projection setup failures are excluded from R5 evidence.

## Verification receipts

Commands run from the isolated repository root unless a frontend working directory is named. Saved text receipts normalize line endings and trailing whitespace only. `NX_DAEMON=false` and `--skip-nx-cache` were used for final Nx checks.

- `bunx nx run wbs-fe-01:e2e-cross-project --skip-nx-cache`: exit **0**, **3 passed in 41.3 seconds**, including unchanged real refresh/reconnect and both persistence cases. [Browser receipt](evidence/predecessor-scope-browser/predecessor-browser-final.log).
- Frontend working directory: `TZ=UTC bunx vitest run src/components/wbs/persisted-remote-dependencies.test.tsx src/components/wbs/remote-dependency-editor.test.tsx src/components/wbs/scoped-dependency-editor.test.tsx src/components/wbs/typed-dependency-editor.test.tsx --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000`: exit **0**, **4 suites / 123 tests passed**, 35.56 seconds. [Focused receipt](evidence/predecessor-scope-browser/predecessor-vitest.log).
- `bunx nx run wbs-fe-01:typecheck --skip-nx-cache`: exit **0**, including `typecheck:module`. [Frontend receipt](evidence/predecessor-scope-browser/predecessor-typecheck.log).
- `bunx nx run wbs-be-01:typecheck --skip-nx-cache`: exit **0**, including its module prerequisite. [Backend receipt](evidence/predecessor-scope-browser/predecessor-backend-typecheck.log).
- `bunx eslint apps/wbs/be-01/src/testing/cross-project-browser-server.ts apps/wbs/fe-01/e2e/cross-project-refresh-entry.tsx apps/wbs/fe-01/e2e/cross-project-refresh.real.spec.ts`: exit **0**, silent success. `bunx nx run wbs-fe-01:lint --skip-nx-cache`: exit **0**. [Configured lint receipt](evidence/predecessor-scope-browser/predecessor-lint-final.log).
- `bunx openspec validate --all --json`: exit **0**, **273 passed / 0 failed**. Existing warnings/informational notices remain; the cross-project change is valid. [Summary and change receipt](evidence/predecessor-scope-browser/predecessor-openspec-summary.json).

An initial sandbox browser run failed before assertions because browser/server sockets were unavailable; browser proofs use the authorized localhost-capable execution boundary. The first configured frontend lint invocation exited nonzero without a diagnostic. The next diagnosed import ordering and an unsafe Playwright JSON assignment in the attachment; both fixture issues were corrected by import sorting and binding the already asserted command as `unknown`. Those failed attempts are not counted as passing checks.

- Explicit `bunx prettier --check` over all changed code, HTML, Markdown and evidence JSON: exit **0**. The normal commit hooks repeat the applicable staged checks. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx format:check --all`: exit **0**, silent success. An earlier whole-repository attempt failed before the final test attachment was reformatted; it is not counted as passing.

## Limits

Only the two seeded transitions above establish browser/database persistence acceptance. This does not establish every endpoint scope, all task 9.2 behavior, production authoring activation, rollout readiness, full frontend suite/build, a host gate, deployment, push or merge. The ordinary frontend response/organization/runtime composition is used within the fixture entry, but this is not a signed-in router/login acceptance test. Full parent verification and independent review remain required.
