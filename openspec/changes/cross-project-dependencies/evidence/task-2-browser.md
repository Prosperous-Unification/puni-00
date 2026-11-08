# Spaces browser fixture repair

Worktree: `/tmp/puni-cross-browser-fixtures`
Base: `ab752e3379a74454e1f7f3c0ddb5d14ca23a45c8`
No Git metadata, production code, shared files, WBS records, assertions, retries, timeouts or layout expectations changed.

## Frozen manifest

Exactly two added fields:

- `apps/wbs/fe-01/e2e/spaces-stub.ts`: add stable `abbreviation: id.toUpperCase()` to the project fixture factory. SHA-256 `984851a8663cf0d7294963992b43438c6c7d98f24b2bfd0baadbb37742f01ab7`.
- `apps/wbs/fe-01/e2e/spaces-timeline.spec.ts`: add stable `abbreviation: P<index>` beside each `p<index>` project ID. SHA-256 `3b24b6f08fdc07bb63421df4da2096e13a8e0ff179c2292b4bfb0d2abd7fb376`.

## Cause and test-first evidence

CI run `39693163327`, shard 4 job `119544383721`, failed the timeline-label case and four `/spaces/s` layout/Tab cases. The original log is `/tmp/puni-ci-39693163327-pixels4.log`. These fixtures omitted the now-required project abbreviation, so response validation refused the space before the original rendering assertions could run.

Fresh worktree-specific contract probe `/tmp/puni-browser-fixture-contract-probe.ts` imports the actual `readSpace` success validator and shared fixture, and extracts/evaluates the timeline's exact fixture expressions without running the test module. Before editing, it observed only missing-abbreviation errors on all four shared projects and both timeline projects (`/tmp/puni-browser-contract-red.log`). After adding the two fields, both exact bodies were accepted (`/tmp/puni-browser-contract-green.log`). The existing CI red plus the actual production-validator negative supplied the authorized TDD evidence for this fixture-only correction. No new production safety check or tracked test was added.

## Browser verification

Read the actual Playwright configuration and ordinary server descriptors. Used the worktree root and `CI=1`, which sets `reuseExistingServer: false`, with shift 2500: backend 5600, gateway 5700, frontend 6700. The actual config allocated a fresh worktree-local database and built/served this worktree's frontend; no user's server was reused.

After `bun run tools/dev/setup.ts` succeeded (`/tmp/puni-browser-setup.log`), ran:

```sh
CI=1 E2E_PORT_SHIFT=2500 bunx playwright test --config apps/wbs/fe-01/playwright.config.ts spaces.spec.ts spaces-timeline.spec.ts --project=chromium
```

The initial sandboxed attempt failed before tests with backend `EPERM: operation not permitted, listen` (`/tmp/puni-browser-playwright.log`). Automatic review approved rerunning the identical command with the permission to start its own local servers. That actual run exited **0: 9 passed in 59.7 seconds**, including every case failed in CI (`/tmp/puni-browser-playwright-escalated.log`). No retries or expectation changes were introduced. Playwright completed and shut down its owned servers normally.

## Other verification

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=/tmp/puni-browser-project-graph.json`: exit 0 before lint; `/tmp/puni-browser-graph.log`.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:typecheck`: exit 0 for the named target plus `typecheck:module`; the project includes `tsconfig.e2e.json`. `/tmp/puni-browser-types.log`.
- `bunx prettier --check apps/wbs/fe-01/e2e/spaces-stub.ts apps/wbs/fe-01/e2e/spaces-timeline.spec.ts`: exit 0; `/tmp/puni-browser-format.log`.
- `git diff --check`: exit 0. Actual diff inspected: two additions only, original assertions preserved. Git status contains only the two assigned modified fixture files.

`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:lint`: exit 0, named target; `/tmp/puni-browser-lint.log`. The generated project graph preceded lint; no boundary-rule skip was reported. No complete CI shard/full browser suite, full repository gate, h1/h2 gate, deploy or other host verification was run. This narrow local run proves the affected fixtures render and satisfy their unchanged nine browser cases; CI integration remains root's responsibility.

## Durable artifacts

Referenced reports/proof outputs are retained in [task-2-browser-proofs](task-2-browser-proofs/). Probe/driver source is stored as text, not discovered tests. Log trailing whitespace alone was normalized. Initial failing, diagnostic-only and superseded observations remain classified in these reports.
