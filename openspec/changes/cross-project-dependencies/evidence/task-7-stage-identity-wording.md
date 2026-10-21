# Stage identity wording round 1

Worktree `/tmp/puni-cross-stage-identity`; root committed the original frozen foundation as `94baeab1e`.

Only changes: narrowed canonicalizer JSDoc to its typed-capture/selected-invariant scope and upstream identifier/type/full authored-capture obligations; renamed the absent workflow-endpoint negative and matching Proof reference. All code, assertions and behavior are preserved.

Frozen manifest:

- `libs/wbs/domain/domain/src/canonical-connected-stage-input.ts`: SHA-256 `d074e9dac8c4ee7e2ed53a7964333b7e2e8cd93f92a7962ece334213b7695618`
- `libs/wbs/domain/domain/src/canonical-connected-stage-input.test.ts`: SHA-256 `75b68e7e8ba2575d8263db1e34b10ab92ac400435e37128821c7f32f96e00a7b`

Fresh verification:

- From domain cwd, `bun test ./src/canonical-connected-stage-input.test.ts`: exit 0, 96 pass / 0 fail; `/tmp/puni-stage-round1-tests.log`.
- `bunx prettier --check` on both changed files: exit 0; `/tmp/puni-stage-round1-format.log`.
- `git diff --check`: exit 0; actual diff inspected and consists only of JSDoc/Proof wording and the single test-name string.

No Git metadata edits, additional tests, full gates or behavioral changes. Original full foundation report and bounded review remain `/tmp/puni-connected-stage-identity-report.md` and `/tmp/puni-connected-stage-identity-review.md`. Integration/runtime/7.4 proofs remain pending as documented there.

## Retained evidence

Referenced logs, mutation matrix and drivers/probes are retained in [task-7-stage-proofs](task-7-stage-proofs/); driver/probe source is stored as text rather than discovered tests. Only trailing log whitespace was normalized. Failed initial invocations, redundant survivors and diagnostic-only observations remain explicitly distinguished.
