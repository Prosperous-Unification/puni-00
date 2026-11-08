# Generated MCP/HTTP node SS/FF parity — bounded evidence

This slice extends tasks 3.2/4.2 on baseline `be9b5a7ce`; both parent tasks remain open. The only executable change is `apps/wbs/mcp-01/src/connected-command-parity.test.ts`. It reuses the unchanged real backend fixture: generated SDK tool call → MCP → mounted authenticated HTTP → migrated SQLite, with synthetic active authoring for positives and ordinary dormant composition for refusal. Machine-key authority is covered; delegated OAuth authority is not.

## Observed behavior

An authenticated HTTP `setEstimate` command changes the remote second step to three days. Its selected node then spans 1→4. A batch creates a one-day successor through the dotted alias `REMOTE.010`. Split IDs and encoded `sn1` predecessor endpoints retain stable project, row and step identities. HTTP and generated MCP produce SS 1→2, FF 3→4 and FS 4→5. Separate no-edge controls remain 0→1.

Success checks bind returned relationship/row IDs to SQLite, persisted type and scopes, one new owner journal, resolved journal identities/type, remote revision 1→2, successor revision 3, generated serialized URL/headers/body, connected endpoint identities/revisions, HTTP/MCP tree equality and new pushes. SS/FF later-command failures identify index 4; dormant authoring identifies index 3. Both compare every persisted table and the push list against a baseline captured after legitimate estimate preparation.

## Watched production faults

Each mutation ran separately against selected real MCP cases and restored the source in `finally`. No production edits remain.

| Fault                                                                             | Observed selected case                                                                                                                                                                                                       | Receipt                                                             |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `command-bindings.ts` add binding substitutes FS for command type                 | Both SS and FF fail persisted-type assertion: actual FS; 0 pass / 2 fail, exit 1                                                                                                                                             | [binding](evidence/mcp-node-ss-ff/binding.log)                      |
| `schedule.ts` SS zero weight becomes predecessor duration                         | SS tree is 4→5 rather than 1→2; 0 pass / 1 fail, exit 1                                                                                                                                                                      | [SS weight](evidence/mcp-node-ss-ff/ss-weight.log)                  |
| `schedule.ts` FF duration difference becomes zero                                 | **SURVIVED:** 1 pass / 0 fail, exit 0. Materialized finish reconciliation independently restores this positive FF finish bound. This case does not prove that nominal expression is decisive.                                | [FF zero weight](evidence/mcp-node-ss-ff/ff-weight.log)             |
| `schedule.ts` FF duration difference becomes predecessor duration                 | FF tree is 4→5 rather than 3→4; 0 pass / 1 fail, exit 1                                                                                                                                                                      | [FF overconstraint](evidence/mcp-node-ss-ff/ff-fs-weight.log)       |
| `schedule.ts` materialized FF boundary compares successor start instead of finish | The command's schedule/replay validation rejects with HTTP 500 / MCP -32603 before the tree assertion; 0 pass / 1 fail, exit 1. This proves the real FF reconciliation path is exercised, not a wrong-placement observation. | [FF materialized boundary](evidence/mcp-node-ss-ff/ff-boundary.log) |
| `compose.ts` ordinary command authoring changes inactive→active                   | Both SS/FF dormant calls succeed instead of HTTP 409; 0 pass / 2 fail, exit 1                                                                                                                                                | [dormant composition](evidence/mcp-node-ss-ff/dormant.log)          |

## Verification

- Original focused parity baseline: **26 pass, 0 fail, 188 assertions** (296.75s).
- Expanded focused parity: `bun test apps/wbs/mcp-01/src/connected-command-parity.test.ts` — **48 pass, 0 fail, 468 assertions** (401.34s), [receipt](evidence/mcp-node-ss-ff/focused-green.log).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-mcp-01:lint` — passed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-mcp-01:typecheck` — passed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx format:check --all` — exit 0.
- `OPENSPEC_TELEMETRY=0 node_modules/.bin/openspec validate --all --json` — **271/271 passed**, existing long-requirement warnings only.

Configured restored regression: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-mcp-01:test` passed: **572 tests, 0 failures, 3421 assertions** (4m15s), [summary](evidence/mcp-node-ss-ff/configured-test-summary.log). Final changed-file Prettier, selected OpenSpec validation and `git diff --check` also passed. Normal commit hooks are required before integration.

Initial sandbox-only baseline could not listen on loopback (`EPERM`); its 25 fixture failures are unavailable-network evidence, not product failures. Approved runs with local loopback access supply all passing and mutation results above. Parallel verification on the host made fixtures take approximately 4–20 seconds. A proposed numeric-PID cleanup was rejected by automatic review for insufficiently established process ownership; no signals were sent and the runs completed naturally.

## Limits

No backend fixture, production authoring, activation, migration or scheduler code changes. No full host gate, CI, browser, Python/image, delegated OAuth, push, merge or deploy claim. Relevant backend rechecks were not run because the fixture and backend production code are unchanged. This bounded test slice does not close the unfinished parent admission, authorization, history, lifecycle or activation matrices.
