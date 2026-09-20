## 1. Shared reporting module

- [ ] 1.1 Add `shared-failures`, its alias, limits, sensitive keys, redaction builder, never-throw wrapper and acceptance coverage — test: `NX_DAEMON=false bunx nx run shared-failures:test --skip-nx-cache`, `shared-failures:typecheck` and `shared-failures:lint`; negatives: omit the project restart entry, remove key rules, make keys case-sensitive, remove pattern rules, remove the never-throw wrapper, remove public redaction, split the shared reporting call, restore accessor invocation, remove the byte budget, remove the depth limit and remove the child limit

## 2. Reporting adoption (needs 1.1)

- [ ] 2.1 Adopt the contract in the observability serializer and log schema, the backend unexpected-error boundary and the MCP server — test: focused observability, backend and MCP boundary tests; negatives: bypass redaction, drop occurrence correlation and expose an unexpected cause through each real boundary; **owned by nobody in batch 2**

## 3. Browser execution (needs 1.1)

- [ ] 3.1 Add a browser execution fixture for `@shared/failures` to the portable test path — test: execute the module in Chromium without Bun or Node globals; negative: introduce a Node-only global into the fixture import closure and observe the browser case fail; **unassigned:** packet 040.1 proves the three published libraries in Chromium and never imports this module

## References

Tasks 1 and 2 implement slices 2 and 3 of the [package adoption plan](../../../docs/superpowers/plans/2026-09-17-personal-package-adoption.md).
