# Task 4.4 bounded mounted redo endpoint evidence

On 2026-10-23, based on `b8b3c545b`, the dedicated
`cross-project-history-endpoint.controller.db.test.ts` exercises the real mounted
HTTP runner, SQLite writer, current organization authority, endpoint evidence,
revision checks, graph admission, compensating journal and publication boundary.
Only external authoring is enabled by the existing test-only synthetic option;
this packet does not activate production semantics.

Each case creates an unrelated local row, then patches it and adds an external
relationship in one HTTP batch. HTTP undo removes the relationship and restores
the local name. During HTTP redo a wrapper calls the genuine
`WorkItemRepository.findById` and changes only the selected remote row's
`projectId` or `id`. Genuine graph, authority, complete-tree and revision reads
remain installed. The predecessor is restricted and owned by another member;
the caller is an ordinary member with successor edit access. The healthy case
proves remote readability suffices without predecessor edit authority.

Wrong ownership returns concealed `404 {error: "not_found"}`. Wrong identity
throws `endpoint row identity mismatch` through the HTTP boundary as
`500 Internal Server Error`. Both refusals preserve the complete all-table
snapshot, the complete selected journal row (without pruning), absent external
relationship, original local name and captured push list.

| Independent injected production fault                     | Observed failure                                                                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Remove only `row.projectId !== address.projectId` refusal | Wrong-owner case returns 200, restores the relationship, replays the local patch and flips the selected journal to `undone=0` |
| Remove only `row.id !== address.workItemId` throw         | Wrong-identity case returns 200 with the same unsafe replay and journal consumption                                           |

The adjacent production `Proof:` comments name these mounted failures. Both
guards were restored before final verification. Raw evidence is in
[evidence/mounted-replay-endpoint](evidence/mounted-replay-endpoint/).

Fresh checks:

- Neighbor-history baseline: 2 pass, 0 fail.
- Dedicated endpoint, dependency history and neighbor history files: 37 pass,
  0 fail, 714 assertions.
- Configured backend typecheck: `NX_DAEMON=false bunx nx run wbs-be-01:typecheck`
  passed, including module typecheck, uncached.
- Focused ESLint uses repository configuration; the first run caught an unbound
  method capture, changed to the established method-descriptor pattern. Final
  focused ESLint passed (exit 0).
- `bunx openspec validate --all --json` passed: 256 changes and 18 specs,
  zero failures. Its log retains the extracted summary.
- Prettier check passed for all four changed TypeScript/Markdown files.
- `git diff --check` passed.

Final lint, format, test and normal-hook commit outcomes are recorded in the
packet logs and commit receipt. Canonical host gate, full backend suite, build,
production activation, push and merge were not run by this bounded packet.
Task 4.4 stays open; Task 7 and Task 10 are unchanged.
