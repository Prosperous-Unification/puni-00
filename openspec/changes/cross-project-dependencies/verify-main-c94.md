# Main c94 integration evidence

Merge parents: feature `d54768ce3ecdfa4ab938eabf2bf6bcedaacafde0` and exact main `c94b2cefa175a11e2dc50fc686f85bb9194a6585`. The isolated branch is `feat/dependency-main-c94` in `/tmp/puni-main-c94`; no main checkout, host gate, Docker, SSH or CI workflow was changed or run.

## Conflict resolution

- `internal.controller.ts` keeps main's `wsTransient` frame for an unsequenced `claims_changed` and `wsData` for sequenced events. It also retains the feature branch's awaited per-socket result and counts only `sent` or `backpressured`, including metrics. Real gateway delivery and fan-out tests verify both contracts.
- `memory-source.test.ts` retains both incident-source atomic restore/refusal coverage and main's memory lease renewal refusal case.
- The MCP README says **91** tools. The actual current emitter followed by `toolsFromDocument(readDocument(...))` counted 91; the prepared generated-document and README inventory tests passed.

## Composed fixture correction

Main's new heartbeat tests assumed an unqualified claim over every step in a work item. The feature branch correctly refuses later workflow steps whose predecessor is unfinished; the merged test got HTTP 409 `prerequisites_unmet`. The fixture now claims explicit eligible first steps and creates two independent claimed leaves in each project. This retains the incoming `leases: 2` and `leases: 4` checks and proves one transient announcement per project despite four moved leases. Temporarily removing SQLite's moved-project `Set` made the real composed heartbeat test report `[A,A,B,B]` and fail its `[A,B]` oracle; restoration passed. Two `import.routes.test.ts` request fixtures were also missing the already-required `RequestMetadata.signal` in both parents; the correction supplies a real `AbortSignal` and changes no production behavior.

## Local checks

- `wbs-mcp-01:prepare`: success; actual generated document/README count 91.
- Gateway delivery, real-socket fan-out, memory-source, generated MCP document and OpenAPI-tool tests: 91 passed, 790 assertions.
- Claim controller, lease integration, cross-project delivery, claim sweep, project claims, plan commands, SQLite lease and SQLite source conformance: 169 passed, 7,467 assertions. The controlled rollback tests intentionally log their injected SQLite trigger error while passing.
- Claim controller and import-route focused rerun after fixture correction: 22 passed; the claim controller alone reran 11 passed with four-lease dedup retained.
- Forced TypeScript build of contracts, core, conformance, memory/SQLite stores, be-01, gw-01 and mcp-01: exit 0 after adding the two request signals.
- Targeted ESLint/Prettier and uncached configured `wbs-be-01:lint`: exit 0. The merge commit and fixture-correction commit used normal hooks.

No broad workspace test, browser, image or host gate is claimed here. The product observer groundwork branch is separate and remains outside this merge packet.
