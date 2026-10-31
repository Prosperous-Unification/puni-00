# Verification

Controller RED: five new tests failed because getChoice was absent. UI RED: with a renderable empty strip, both arrival actions failed missing-region assertions and the collapsed-footer test observed unwanted open controls. Initial missing-export test was an infrastructure error and is not counted as behavior evidence.

Focused GREEN: `bun test ./apps/website/fe-01/src/analytics-components.test.tsx ./libs/website/adapters/analytics/src/analytics.test.ts --timeout=30000`: 84 pass, 0 fail, 455 assertions.

Production-path faults (all restored): removing persisted-choice admission failed both valid-choice UI cases; removing disabled admission failed disabled/operator/unknown routes; injecting rejected on write refusal hid both failed actions; removing independent choice notification failed focus synchronization while loading. Each mutation exited 1. Logs: `/tmp/arrival-{visibility-persisted,visibility-disabled,write-refusal,independent-notification}.log`.

Named project checks and limitations are recorded after the final run.

Final affected checks: `NX_DAEMON=false bunx nx run-many -t test,lint,typecheck,build -p website-analytics,website-fe-01 --skip-nx-cache --output-style=static` exited 0. Analytics: 85 tests, 0 failures; frontend: 156 tests, 0 failures. Both lint, typecheck and build targets passed, plus three dependency builds. Log `/tmp/arrival-nx-final.log`. The first complete run exposed a partial test-double cast and callback/import lint errors; those were fixed and all targets rerun.

Additional unreadability mutation: replacing unreadable with unset failed both persistence-action tests (expected unavailable, received unset), exit 1; restored. Log `/tmp/arrival-unreadable.log`.

`bunx openspec validate puni-arrival-choice --strict --json` passed; `bunx openspec validate --all --json` passed all 312 entries (294 changes, 18 specs). `git diff --check` passed.

Offline Chromium audit: explicit development-enabled named Nx build, then `bun .superpowers/sdd/puni-arrival-choice-plan/browser-validation.ts`; eight cases across `/` and `/manual` at 320, 390, 768 and 1440 pixels passed. Every external request was intercepted/aborted; only a loopback static server was contacted. Google was blocked and API responses were locally modeled 503. Checks established one in-flow strip below the header, no horizontal overflow, collapsed privacy controls, stacked small-mobile actions, minimum target height 44px, body contrast 14.67:1 and action contrast 12.55:1. Focus stayed on the existing page heading; mounted component tests also preserve an existing request control's focus. Observations: `/tmp/arrival-browser-validation.json`; captures: `/tmp/arrival-{320,390,768,1440}-{build,manual}.png`. Visually inspected the 320px Build capture.

Limits/skipped: no provider/account/model calls, live GA delivery/report evidence, private-site projection, remote hosts, host-wide gate, deployment or push. Local browser API outages establish layout under failure; they do not establish live intake/provider behavior. Existing collection/privacy payload tests were run unchanged. No dependency installation or shared node_modules changes were made. Independent review is delegated to the parent after this task's commit.
