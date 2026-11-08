# Task 4.1 independent review

Verdict: **changes requested — two P2 findings**. The storage design is substantially implemented, but the trusted-state read boundary misses one duplicate-identity case and the SQLite immutable-owner proof is masked by another guard. This is a task 4.1 review, not a feature completion or release approval.

Reviewed clean `/tmp/puni-cross-storage` at `14b43aab431c1d2cb87f72fc217f9235920e01d9`, base `9bce1aaabd384ae0a8bd6fc50c57d2ae9e4145b3`. Read the task brief, binding architecture ruling, approved design and relevant cross-project/command specs, implementation report, generated review package, implementation/callers/tests, and supplied proof logs. No production files changed, subagents spawned, or full gates run.

## Findings

### P2 — Filtered reads can publish a duplicated physical identity

Location: `libs/wbs/adapters/store-sqlite/src/typed-dependency.ts:261` (both physical queries filter before the ID check at line 281; owned external filter at line 249).

Requirement: the binding interface and approved D3 require owned/incident reads to reject duplicate physical identities as corrupt trusted state. A relationship ID must remain one identity across representations.

Evidence: the current duplicate set covers only rows selected by the requested owner/project set. I independently ran `bun /tmp/puni-storage-review-probe.ts` against the frozen production repository and migration runner (Bun 1.4.2). In a disposable DB I added a valid local `B.b2 → B.b`, dropped only `external_dependency_cross_identity_insert`, and inserted a valid external `B.b → A.a` with the same `same-id`. Both projects have real same-organization mappings; all endpoint ownership constraints remain satisfied. Actual output:

- `listByProject('a')` returned the external row with `id: 'same-id', projectId: 'a'`.
- `listByProject('b')` returned the different local row with `id: 'same-id', projectId: 'b'`.
- `listIncident(['a'])` returned the external row successfully.
- Only `listIncident(['a','b'])` threw `duplicate unified dependency same-id`.

Thus each single-owner reader can publish a different meaning for the same relationship identity. The existing corruption test uses the same successor owner for both physical rows, so it cannot detect this case. Normal guarded writes prevent introducing this state; the defect is specifically in the required trusted-state corruption refusal.

Fix: within the same read transaction, check selected relationship IDs against the other physical table independently of its owner/project filter (or an equivalent checked union/query). Do not broaden the returned authorization scope. Add production owned and incident tests with valid differently owned rows sharing an ID, and watch the new guard's removal make those tests resolve incorrectly. Consider the same filtered-union issue for `removeAllFor`, which also calls `readPhysical` with a work-item filter.

### P2 — SQLite owner immutability has no isolated behavioral negative

Location: `libs/wbs/adapters/store-sqlite/src/typed-dependency.db.test.ts:271`; associated production `Proof:` in `typed-dependency.ts` immediately before the immutable-owner comparison in `update`.

Requirement: representation updates preserve the original successor owner; task 4.1/R5 require a meaningful production-path negative for each ownership guard, without another check masking its removal.

Evidence: this test changes only top-level `projectId`, retaining both endpoints in the original project. Supplied `/tmp/puni-storage-mutations/immutable-owner.log` shows that removing the immutable-owner comparison still rejects the update through successor-owner agreement. The only failure is the expected `cannot move` message versus actual `has inconsistent successor ownership`. It proves diagnostic precedence, not preservation of the immutable-owner invariant. The report/comment are candid about the different reason, but counting this as the SQLite invariant proof overstates what was tested. The memory fixture's coherent owner-change test does not establish the SQLite repository behavior.

Fix: seed valid destination work items in another project, propose a complete relationship whose top-level owner, successor project, and endpoint ownership all agree with that destination, and preserve all other constraints. Assert refusal and unchanged physical rows/audit/revisions. Remove only the immutable-owner check, observe the coherent owner change being accepted and the behavioral assertion failing, restore it, then replace the adjacent Proof/evidence. A local-to-local alternative owner can isolate this guard without introducing organization or representation checks.

## Other reviewed behavior

- Required `ScopedDependencyEndpoint`/`ScopedTypedDependency` are exported while local domain types remain explicit; storage owner equals successor project. One port supplies owned and deterministic incident reads.
- Both component queries and evidence reads share an explicit transaction. The coherent-read fault log shows duplicate old/new representations after transaction removal, establishing the actual snapshot issue.
- External SQL contains real same-organization mappings, composite work-item and step ownership, restrictive endpoint/step/mapping deletion, discriminant/nullability/distinct-project checks, six incident indexes, and all eight cross-table INSERT/UPDATE identity/key triggers with the relevant key columns.
- Local↔external updates preserve relationship ID and original creation audit including null values, stamp normal update time, and bump the deduplicated old/new endpoint union. Destination-insert and revision-write failures exercise transactional rollback.
- Bulk removal checks protected predecessors before mutation; successor-owned removal remains explicit and journalable. External retention blocks migration rollback; empty rollback preserves raw local rows and audit through actual migration/ledger machinery.
- History decoding normalizes complete old local payloads, validates complete scoped payloads, refuses mixed scope, and recursively normalizes batches. Local constructors/remaps retain required scope. Historical capture explicitly projects old endpoint fields and checks incident external rows in both directions before returning an old-format capture.
- Memory conformance deliberately proves identity/ownership shape, owned/incident behavior and movement; it does not claim SQLite endpoint/organization integrity. SQLite typed-source conformance seeds real same-organization mappings. The complete source-conformance files were run in the supplied evidence, not merely the typed fixture.

## Proof and verification assessment

Reviewed supplied logs rather than rerunning broad suites:

- `/tmp/puni-storage-final-focused.log`: 160 pass, 0 fail, 626 assertions.
- `/tmp/puni-storage-conformance.log`: 150 pass, 0 fail, 12,318 assertions across both complete source-conformance files.
- `/tmp/puni-storage-final-regression.log`: 212 pass, 0 fail, 716 assertions, including mounted/local regressions.
- Implementation report also records migration-ledger 91 passing tests, final lint/format and migration lint; no integrated/full gate is claimed here.

The initial empty-statement trigger/index mutations and masked scope/distinct-project negatives are invalid as invariant evidence. Their corrected scripts replace removed declarations with valid `SELECT 1;`, use valid steps for unknown scopes and valid work-item ownership for same-project violations. `summary-corrected.json` and its corresponding logs show `Received function did not throw` at the intended production negatives for all eight triggers, both scope checks, distinct projects and the unique index. These corrected entries are meaningful and supersede the initial entries. The six composite-FK removals likewise reached their intended violation assertions. Read-evidence removals returned corrupt rows; history/fixture/working-plan negatives and coherent-transaction fault reach the intended boundaries.

The 48-fault count is not equivalent to 48 independently established integrity invariants. The immutable-owner limitation is finding 2. The final `down-missing-local-table` fault establishes the explicit missing-table diagnostic instead of a subsequent missing-trigger diagnostic; it does not establish a newly possible successful destructive rollback. Its claim should stay that narrow. The separate retained-external rollback fault does establish actual loss if the guard is bypassed.

Fresh reviewer execution was limited to version/clean-HEAD inspection and the concrete duplicate-read probe above. The probe creates/removes its own disposable database and changes no tracked source. No new mutation sweeps, full Nx checks, host gate, build, OpenSpec checkoff, deployment, activation, scheduling or feature-wide verification were performed.

## Integration and scope boundaries

The frozen branch is not independently green: supplied type output identifies missing scoped endpoints in `plan-import.feature.ts:570–571`, and the report identifies the project-abbreviation insertion audit policy failure. These are concrete broken integration callers/checks, not blanket-ignored errors. Root reports API branch `695869a1e` carries the scoped import adaptation and narrow audit policy exception, with separate API fixes underway. Those files were intentionally not owned by the storage worker; the merged integration still needs fresh type, import, audit and required gate evidence before task completion. Earlier app fixture diagnostics have corresponding scoped changes in this reviewed commit, but I have not claimed a fresh integrated typecheck.

Authorized connected command admission, complete connected graph capture/validation, remote structural/history behavior (tasks 4.2–4.4), copy/transfer/save semantics, connected scheduling/readiness/fanout, and semantic activation/deployment barriers remain planned work. Their absence is not added as a task 4.1 finding. Existing local-only runtime paths must remain dormant for external authoring until that feature barrier is complete.

## Scoped re-review — da756535c

Verdict: **approved for this storage fix scope; both original P2 findings resolved. No new actionable finding in the three-file follow-up.** Integration/release approval remains outside this verdict.

Reviewed clean `/tmp/puni-cross-storage` at `da756535cd60b71ad2b557c4d16c8f8161fbd32c`, diff from `14b43aab431c1d2cb87f72fc217f9235920e01d9`, using the generated review package and appended implementation report. No tracked files changed.

- **Finding 1 resolved.** `readPhysical` now checks selected local IDs against the external table and selected external IDs against the local table without the other table's project/work-item filter. Those queries run in the existing transaction and return only IDs for integrity validation; they do not broaden returned relationship scope. This detects corruption both when the conflicting row is already selected and when it is hidden. The five new production regressions cover owned A, owned B, incident A, external-side bulk removal and local-side bulk removal, checking complete raw rows/audit and endpoint revisions/update times remain unchanged. `/tmp/puni-storage-review-fix-filtered-identity-mutation.log` confirms bypassing only the counterpart guard produces five actual incorrect resolutions, not setup errors or a different refusal.
- **Finding 2 resolved.** The SQLite owner-change test now proposes a coherent local-to-local move: valid destination project, two real destination work items, matching top-level and endpoint projects, valid whole scopes. It checks old/new owned reads and unchanged physical/audit/revision state. `/tmp/puni-storage-review-fix-coherent-owner-move-mutation.log` confirms removing only immutable-owner agreement accepts that proposal (`resolved without throwing`). The production Proof now describes this behavioral evidence. The report correctly supersedes the old diagnostic-only owner proof and keeps the missing-table rollback proof explicitly diagnostic-only.

Supplied restored-source evidence inspected: `/tmp/puni-storage-review-fix-focused.log` reports 47 pass/0 fail and 209 assertions across the four focused files. `/tmp/puni-storage-review-fix-conformance.log` reports 1 pass/0 fail and 1,969 assertions for SQLite terminal certification, listing every exact offered case including typed dependency ownership/incident/movement/removal; 74 other harness scenarios were explicitly filtered out. Format output confirms all matched files comply, and supplied lint/diff logs contain no diagnostics. These are implementation-run results, not claimed reviewer reruns. Fresh reviewer commands confirmed the frozen HEAD and clean tracked worktree; no broad test suite, source mutation, integrated typecheck, or gate was run during re-review.

Combined API integration, types, imports, audit policy verification, required host gate and all later feature activation/capture/scheduling work remain root-owned pending checks as previously stated. The earlier report's two changes-requested findings are closed by this appended verdict; it does not convert task 4.1 into a complete external-dependency feature claim.
