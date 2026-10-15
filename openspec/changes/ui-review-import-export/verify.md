# Verify

All runs 2026-10-15 in `/home/df/wd/puni/ui-import-export` (branch from main
5b65fd5ae), Chromium on Linux, `E2E_PORT_SHIFT=900`.

## Commands and results

- `bunx nx run wbs-fe-01:test --skip-nx-cache` — node 74 files / 933 tests, jsdom 205 files / 4035 tests, zoned 4 files / 5 tests: all passed (exit 0).
- `bunx nx run-many -t typecheck lint:fast -p wbs-fe-01 --skip-nx-cache` — passed.
- `bunx prettier --check` on touched files — clean.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json` — 200/200 valid.
- Playwright: `plan-import, toolbar-panels, home, import-with-ai` — 19 passed.

## R5 proofs (observed failures)

- Words (`plan-import-words.test.ts`): against the old sentences all 12 new cases failed, e.g. `Received: "Imported 19 work items. Created no directory names. Solution reference: none."` and `expected 'Plan JSON import failed (invalid_json…' to be 'This file is not JSON.'`.
- Stale refusal (`project-page.test.tsx`): dismissal removed → `expected [ …(2) ] to deeply equal [ Array(1) ]`.
- Dated name (`project-page.test.tsx`): name rule bypassed → `expected [ 'Rewire the shed' ] to deeply equal [ 'Rewire the shed (imported 15 Oct)' ]`.
- Not a plan export (`project-page.test.tsx`): header check disabled → `This plan export has a value the app cannot read: calendarMarkers must be an array (was missing).`
- Clipboard (`plan-toolbar.test.tsx`, 3 cases): against the shared sentence each failed on `… Download the CSV instead.`
- Browser (`e2e/plan-import.spec.ts`): against main's import code all three tests failed (`Received: "Plan JSON import refused: unknown_ref at workItems[12].dependsOn[0]."`, `"Plan JSON import failed (invalid_json)."`); with the dismissal removed the new test read both refusals; with the name rule bypassed the picker held the source's own name.
