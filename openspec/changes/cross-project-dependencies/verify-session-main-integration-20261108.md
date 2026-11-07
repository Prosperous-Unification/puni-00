# Session prefix integration with current main

This mechanical integration joins session prefix `c955920c1db94d68d359f53e2f2d5849d64fae7c`
with current main `acfdc02c7f0acc98606c87312a694ed2b89302ea`. Git merged both trees
without textual conflicts. Main's PostgreSQL decisions retain ADRs 0069 and 0070;
the unmerged dependency decisions move to ADRs 0071–0075, with current links
updated. Raw evidence and archived proof bytes remain unchanged. This record does
not claim cross-project dependency delivery or installed activation.

The CI fixed-remote-leaf negative test originally gave eight leaf groups one
20-second deadline. An isolated run timed out after 14 assertions. Reusing the
identical excluded fixture reached all 24 assertions but still exceeded that
shared deadline. The test now parameterizes the same eight leaves, preserving
all three production-path refusals per leaf and the existing 20-second deadline
for each case. The focused run passed all eight cases and 24 assertions in
21.35 seconds overall; no production check changed.

Fresh local evidence in the isolated integration tree:

- `bun install --frozen-lockfile`, with an isolated temporary Bun cache: 1,498
  packages installed; no lockfile change.
- `bunx nx run tool-devsync:check:docs`: current documents/indexes, four ADR/root
  tests and the root-migration check passed.
- `bunx openspec validate --all --json`: 334 passed, zero failed.
- Focused `workspace-projects`, `workspace-inventory`, `workspace-targets` and
  `toolchain-pins` Bun suites: 77 passed, zero failed, 269 assertions.
- Full CI plan, merge-base and workflow suites after parameterization: 104
  passed, zero failed, 881 assertions.
- Full `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx format:check --all`:
  exited zero; focused changed-test/renumbered-ADR Prettier check also passed.

The first sandboxed CI and lint-boundary attempts encountered Bun child-stdout
`EPERM`, so those attempts do not prove the intended assertions. They are retained
as failed attempts; verification must use the unrestricted reruns. Final lint-boundary output is recorded in the integration handoff.

No remote gate, full runtime gate, build, push, PR merge, migration, host change or
deployment was performed in this integration task. Backend boot-admission repair
is a separate reviewed slice and must be integrated before final runtime checks.
