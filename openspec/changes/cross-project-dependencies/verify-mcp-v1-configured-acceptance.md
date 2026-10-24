# Configured MCP acceptance after immutable V1 support

Base: `7036af7b898246854705b89e887252d1f7150355`. Isolated worktree:
`/tmp/puni-mcp-v1-acceptance`, branch `fix/configured-mcp-v1-acceptance`.
This packet repairs acceptance fixtures after the backend and MCP immutable
V1 support changes. It changes no production behavior or activation authority.

## Root cause and correction

The machine-key parity backend unconditionally seeded synthetic durable ENABLED
authority. Its dormant mode only omitted `syntheticExternalCommands`, which
formerly supplied external authoring. The composed harness now opens a capable
source, so its ordinary services correctly authorize ENABLED external commands.
The fixture now seeds authority only for active cases and uses ordinary services
for every case, removing the synthetic command callback. Dormant cases retain
the migration's actual durable DISABLED marker and their indexed HTTP/MCP 409
expectations, complete table snapshots and publication comparisons.

Exact forwarded-request assertions predated MCP's immutable V1 claim and omitted
`X-WBS-Dependency-Semantics`. Both assertions now require the exact V1 header
alongside authorization and content type, with complete request equality retained.
No expected dormant refusal was changed to success.

## Red-green evidence and limits

The initial sandbox attempt failed at localhost listen with EPERM. With authorized
disposable loopback access, the selected existing `MCP commits whole` and
`ordinary MCP composition` tests reproduced both defects: 0 passed, 2 failed.
The former received the additional exact V1 header; the latter received success
(`isError` undefined) instead of the expected dormant refusal. After the fixture
and expectation corrections, the same selection passed: 2 passed, 0 failed,
19 assertions. The adjacent dormant `Proof:` retains its original production
fault and records the newly observed unconditional ENABLED fixture fault.

A temporary production mutation suppressing wbs-client's V1 header was watched
and restored: the exact whole-FS forwarded-request equality failed with the
missing header, 0 passed / 1 failed. Its adjacent `Proof:` names this fault.

No production safety check was added or changed. Existing command/index,
rollback, full-table and publication assertions remain intact. This packet proves
transport behavior against disposable synthetic durable receipts; it does not
prove trusted activation publication, independent participant exclusion or live
rollout readiness.

## Verification

- Configured `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-mcp-01:test --skip-nx-cache --outputStyle=static`:
  624 passed, 1 failed, 625 tests across 24 files, 4136 assertions, 381.06 seconds.
  All 16 original parity failures passed. The sole failure was the unchanged
  `Docker document stage generates using exactly its copied sources` timing out
  at 10031.93ms with its existing 10000ms limit. The complete target exited 1.
- Unchanged `bun test apps/wbs/mcp-01/src/startup-document.test.ts --coverage --coverage-reporter=lcov --timeout=10000`:
  6 passed, 0 failed, 18 assertions. Docker-copy generation took 5449.05ms;
  the whole file took 8.49 seconds. No timeout or test was modified.

- Final repeat of the exact configured MCP target on committed
  `fcf202d02919c5b6d9ec98650e93c660f05e0c13`, unchanged test/timeout settings:
  625 passed, 0 failed, 24 files, 4136 assertions, 354.35 seconds; Nx exited 0,
  cache bypassed. The earlier full-target timeout remains recorded above.
- Configured `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint,typecheck -p wbs-mcp-01,wbs-be-01 --skip-nx-cache --outputStyle=static`:
  passed both projects and the backend module-typecheck dependency, cache bypassed.
- Restored focused selection after the watched production header omission:
  2 passed, 0 failed, 19 assertions, 7.26 seconds. Production forwarding had no diff.
- Independent source review found no issues; its restored focused run passed
  2 tests, 0 failures, 19 assertions in 7.19 seconds.
- Scoped Prettier check and `git diff --check`: passed. Normal repository
  commit hooks also passed; Tool Wiki reported its existing inactive activation
  root explicitly rather than claiming certification.

Dependencies reuse the existing workspace installation through an ignored
`node_modules` symlink; no fresh frozen install was performed. No host gate,
whole-repository gate, push, live database work or deployment is claimed.
Integrated exact-SHA host acceptance belongs to the parent delivery.
