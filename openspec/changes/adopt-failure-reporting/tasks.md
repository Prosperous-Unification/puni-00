## 1. Shared reporting module

- [x] 1.1 Add `shared-failures`, its alias, limits, sensitive keys, redaction builder, never-throw wrapper and acceptance coverage — test: `NX_DAEMON=false bunx nx run shared-failures:test --skip-nx-cache`, `shared-failures:typecheck` and `shared-failures:lint`; negatives: omit the project restart entry, remove key rules, make keys case-sensitive, remove pattern rules, remove the never-throw wrapper, remove public redaction, split the shared reporting call, restore accessor invocation, remove the byte budget, remove the depth limit and remove the child limit

## 2. Reporting adoption (needs 1.1)

- [ ] 2.1 Adopt the contract in the observability serializer and log schema, the backend unexpected-error boundary and the MCP server — test: focused observability, backend and MCP boundary tests; negatives: bypass redaction, drop occurrence correlation and expose an unexpected cause through each real boundary; **owned by nobody in batch 2**

## 3. Browser execution (needs 1.1)

- [x] 3.1 Add a browser execution fixture for `@shared/failures` to the portable test path — test: execute the module in Chromium without Bun or Node globals; negative: introduce a Node-only global into the fixture import closure and observe the browser case fail, run as `CI=1 NX_DAEMON=false bunx nx run wbs-fe-01:e2e -- e2e/fault-boundary.spec.ts`, which builds the app's own root fault boundary through `vite.config.ts` and runs it in Chromium

## 4. Frontend fault boundary (needs 1.1)

- [x] 4.1 Disclose a public report and an occurrence identifier from both frontend fault boundaries, keep react-dom's own raw console line out, and make deciding a disclosure incapable of throwing — test: `apps/wbs/fe-01/src/components/chrome/app-fault.test.tsx`, `src/main.test.tsx` and the Chromium case above; negatives: disclose the caught value's message, log the caught value, drop either occurrence-identifier element, drop the chart's own disclosure selector, widen that selector to every error, read the caught value's `message` property directly instead of its descriptor, accept a non-string sentence, call the selector before the reporting-loss return, remove the selector guard, drop the root options argument in `main.tsx`, remove `onCaughtError` from those options, append the caught value to the recovered-fault line, drop that line's identifier, reach an unexpected origin, and drop the `@shared/failures` alias from the suite config

## References

Tasks 1 and 2 implement slices 2 and 3 of the [package adoption plan](../../../docs/superpowers/plans/2026-09-17-personal-package-adoption.md).
