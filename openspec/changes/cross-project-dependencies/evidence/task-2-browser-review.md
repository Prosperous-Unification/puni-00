# Independent spaces browser fixture review

**Approved: no findings in the bounded two-field repair.** Reviewed against base `ab752e337`, the exact supplied SHA-256 identities, production response shapes, unchanged browser assertions, CI failure output, and worker verification logs. No production behavior or validation was weakened.

The exact patch adds only:

- `apps/wbs/fe-01/e2e/spaces-stub.ts:40`: `abbreviation: id.toUpperCase()` in the common project factory.
- `apps/wbs/fe-01/e2e/spaces-timeline.spec.ts:34`: `abbreviation: P<index>` beside its corresponding `p<index>` ID.

Both hashes match the requested freeze: `984851a8663cf0d7294963992b43438c6c7d98f24b2bfd0baadbb37742f01ab7` and `3b24b6f08fdc07bb63421df4da2096e13a8e0ff179c2292b4bfb0d2abd7fb376`. A fresh `git diff ab752e337 --stat` reports exactly two insertions across these two files. The additions produce deterministic, distinct abbreviations for the fixture projects; existing IDs, cross-response references, names, project ordering and layout stress inputs remain intact. No assertions, routes, response validators, retries, timeout values or viewport dimensions changed. The existing Playwright configuration specifies zero retries.

## Independent contract verification

I ran `/tmp/puni-browser-fixtures-review-probe.ts` against the actual production `readSpace` and `listProjects` success validators. It imports the common fixture and extracts/evaluates the exact timeline fixture expressions using the TypeScript AST, without executing the browser test module. It then removes only abbreviations from detached cloned response bodies.

Fresh output, exit 0:

```text
shared: restored accepted; 4 missing-abbreviation errors reproduced
timeline: restored accepted; 2 missing-abbreviation errors reproduced
project-list: restored accepted; 6 missing-abbreviation errors reproduced
```

This independently confirms both acceptance of the repaired fixtures and rejection of the precise old defect. The shared factory also repairs the project picker list response. No shared source edits were made during the negative probe.

## Verification audit and limits

- `/tmp/puni-ci-39693163327-pixels4.log` records the claimed five failures: timeline label visibility plus `/spaces/s` rendering and Tab cases at 1280 and 375 pixels. They fail before the original geometry/control checks can finish. The independent contract negative explains that failure pattern without weakening those checks.
- `/tmp/puni-browser-playwright-escalated.log` records the actual worktree frontend build, port 6700 server, all nine named cases passing, and `9 passed (59.7s)`. This includes all five CI failures. I reviewed the real Playwright configuration: the reported `CI=1` prevents ordinary server reuse, while the port shift selects isolated server ports. The initial sandbox listen failure is disclosed in the worker report and is not counted as a test pass.
- `/tmp/puni-browser-types.log` records actual module and frontend typechecks, zero cache hits; the frontend project includes the E2E TypeScript configuration.
- `/tmp/puni-browser-lint.log` records the actual frontend target, including E2E sources, succeeding with zero cache hits. `/tmp/puni-browser-format.log` records both files formatted. Fresh `git diff --check` also passed.

I independently reran the schema positive/negative checks and reviewed existing browser/lint/typecheck output; I did not rerun Playwright, frontend lint/typecheck, the entire CI shard, any full host gate or deployment. These limits do not block this fixture-only correction. Full integration CI remains root-owned.

## Durable artifacts

Referenced reports/proof outputs are retained in [task-2-browser-proofs](task-2-browser-proofs/). Probe/driver source is stored as text, not discovered tests. Log trailing whitespace alone was normalized. Initial failing, diagnostic-only and superseded observations remain classified in these reports.
