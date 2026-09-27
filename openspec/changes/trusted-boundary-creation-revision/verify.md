# Verification

## 2026-09-27

- Red first: with Plan import and Plan document registered with `creationRevision` and no loader change, `pins exact pre-index tuples and passes observe lint from external trust` failed with `boundaries[30].creationRevision must be removed` (exit 1, expected 0).
- Green: the same test passed (observe lint exit 0, `accepted: true`); the new negative suite passed.
- Each check disabled alone, `refuses a creation revision that is not the new module's own first commit` run through the production CLI:
  - both-selectors guard: refused only as `trusted boundary baseline escapes selector … README.md`;
  - selects-nothing check: refused only as `not the boundary's first commit`;
  - existed-at-freeze check: refused only as `not the boundary's first commit`;
  - descent from the freeze: the forged pre-freeze commit was accepted (expected exit 1, received 0);
  - first touch since the freeze: the later commit `c5516951` with an honest baseline was accepted (exit 0);
  - baseline comparison: a README blob from `c5516951` was accepted (exit 0);
  - unreadable-revision context: rethrowing the cause reported only `absent committed revision 0000…: fatal: Needed a single revision`.
- `refuses a non-pilot creation revision with no reviewed source revision` (trusted-policy suite) with the pilot guard disabled: expected exit 1, received 0.
- `TOOL_WIKI_TRUSTED_NODE_MODULES=… env -u CLAUDECODE bun test --preload …/preload.ts src/policy/pilot-policy.test.ts src/policy/trusted-policy.test.ts`: 78 pass, 0 fail.
- `env -u CLAUDECODE bun test src/module-labels.test.ts src/repo-namespacing-handoff.test.ts` in `tools/tool-devsync`: 20 pass, 0 fail, after re-pinning the legacy-occurrence digest (`test fixture or proof` 106 to 107, occurrences 308 to 309).
- `NX_DAEMON=false bunx nx run-many -t lint:fast typecheck -p twilight-burokrat tool-devsync`: success.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`: 128 passed, 0 failed.
- Not run: `relocation-activation.test.ts` after the final change (an earlier run was interrupted), the full `twilight-burokrat:test` target and the h2puni gate; the orchestrator gates the integration branch.
