# Task 4.4 mounted structural replay revocation

Base `949380a2ac0370bc1b16b6dca7ae90aa128aed98`. This bounded packet adds two mounted acceptance cases to the existing compound first-child incident fixture. Production behavior is unchanged; parent task 4.4 remains open.

Ada is an organization member. Grace owns the initially unrestricted structural project and a restricted remote successor. Ada can read the successor. A compound command creates the structural row's first child, moves incoming and outgoing node incidents to that child, and patches an unrelated row. The mounted controls undo and redo the compound, check exact incident endpoints, and check the selected journal's `undone` transition.

Each direction then holds the source writer, observes request admission and entry into the writer queue, and restricts only the structural project through a separate SQLite connection. Grace's ownership and Ada's membership and credential remain unchanged. After release, undo and redo each return HTTP 403 `forbidden`. Complete application table snapshots, including both project journals, incident identities and audits, work-item revisions, event log and sequencer, and recovery audit, equal their pre-release snapshots byte for byte. The selected history entry is retained, publication requests do not grow, and the graph replay spy is never called. This is an admission refusal, so stale-history pruning does not apply.

## Independently watched R5 faults

The focused command was `bun test apps/wbs/be-01/src/controller/cross-project-incident-replay.controller.db.test.ts --test-name-pattern 'queued structural project edit revocation'`. Each temporary mutation was restored before the next one:

| Single omitted guard                                                                     | Observed result                                                                                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `PlanCommands.walk`: bypass `if (refusal !== null) return refuse(refusal)`               | [Both directions failed](proofs/plan-consumer-fault.txt), 0 pass / 2 fail, exit 1; each returned unsafe HTTP 200 instead of 403.      |
| `ProjectRepository.admitEditInOrganization`: bypass `classified === 'refused'` rejection | [Both directions failed](proofs/repository-refusal-fault.txt), 0 pass / 2 fail, exit 1; each returned unsafe HTTP 200 instead of 403. |

The restored focused run and the neighboring command-access suite passed [7/7 tests, 222 assertions](proofs/focused.txt). No new production check was added; the adjacent `Proof:` comment on the mounted tests records both injected faults.

## Checks and limits

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:typecheck --skip-nx-cache --output-style=static`: [passed](proofs/typecheck.txt). The first run found two new test annotations and was corrected before the retained run.
- `NODE_OPTIONS=--max-old-space-size=8192 NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:lint:fast --skip-nx-cache --output-style=static`: [passed](proofs/lint-fast.txt). The first attempt without the larger heap exited 1 without rule diagnostics; a scoped run identified and fixed import sorting.
- Prettier, OpenSpec validation, and base-relative `git diff --check` are recorded in their [format](proofs/format.txt), [OpenSpec](proofs/openspec.txt), and [diff](proofs/diff-check.txt) outputs.

Dependencies were reused from the primary worktree through an isolated clone symlink; a frozen install is not claimed. Full host gate, complete CI/build, migration lint, secrets scan, activation and deployment were not run. No push or merge is claimed.
