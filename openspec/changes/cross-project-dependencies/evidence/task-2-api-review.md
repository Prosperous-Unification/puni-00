# Task 2.2 independent review

Reviewed clean commit `695869a1e5b12c0c81863f95226a70691bc42a5e` in `/tmp/puni-cross-api`, against base `3fd1d9dce`. Read the task brief, implementation report, generated review package, repository rules, and updated normative `project-addresses/spec.md` and design D2 in `/home/df/.codex/worktrees/b3b7/puni-00`.

**Spec verdict: task 2.2 is substantially implemented but does not yet satisfy the combined-patch revision contract and required rollback proof standard. Overall approval: request changes.** No Critical findings. Three Important findings below. This is a slice review, not completion of the full feature; the remaining 27 slices are outside this verdict.

## Strengths

- Creation performs the legacy trigger insert, ownership move, bounded candidate selection, abbreviation write, steps, and persisted reread within one transaction. Modeled exhaustion throws through that transaction before translation; unexpected counter failures are not broadly swallowed. The candidate generator preserves the three ordered recommendations followed by AA–ZZ, deduplicates, and has at most 679 entries. Occupancy excludes the inserted project.
- Scoped edit classification precedes the abbreviation write and uniqueness disclosure. The joined trusted decoder is shared by ordinary, organization, solution-slug, list and write-reread paths; LEFT JOINs preserve missing-row errors. The list remains one statement.
- Live project contracts require abbreviation, while document projects accept absent captured metadata and validate present metadata. Import uses writable settings and allocates its own code. Saved-record wire schemas remain independent. Legacy `ProjectService.create` exposes the typed refusal, and `expectCreated` is confined to test fixture premises.
- The approved audit exemption is narrow. Parent audit/revision mutation evidence and the exemption's schema-fault evidence exercise the actual checks. Mechanical fixture adaptations retain the original expectations, apart from the documented additive metadata golden update.

## Important findings

### 1. Abbreviation plus timezone PATCH increments twice and returns a stale revision

**Location:** `libs/wbs/application/core/src/module/project/project.resource.ts:518` (related: lines 417, 497–506, 534); `libs/wbs/adapters/store-sqlite/src/project.ts:1391`.

**Requirement:** Updated design D2 and the binding task brief require a combined abbreviation/settings patch to increment the project revision once. The reply must describe the persisted project.

`updateWithin` removes `timezone` from the ordinary patch, writes the abbreviation through `editInOrganization`, then calls `setTimezone`, which independently increments the revision. It finally calls `zoned(updated)` on the intermediate project, so its revision remains stale. A mounted composed-harness probe against the frozen commit produced:

```json
{
  "createdRevision": 0,
  "patchStatus": 200,
  "responseRevision": 1,
  "stored": { "revision": 2, "timezone": "Europe/Kyiv" }
}
```

The request was `PATCH /api/projects/:id` with `{ "abbreviation": "CHANGED", "timezone": "Europe/Kyiv" }`. The existing combined test only combines abbreviation with `name`, so it misses this supported setting. The split timezone path predates this slice, but exposing abbreviation through it violates this slice's explicit combined-patch guarantee.

**Fix:** Let the existing authorized project-settings store write carry timezone together with abbreviation and the other settings, with one parent UPDATE/audit/revision bump and a final reread. A suitable seam is extending the store patch accepted by `ProjectRepository.write`; retain the separate `setTimezone` operation for its standalone/import callers if those semantics are still needed. Preserve authorization, timezone validation and the enclosing transaction. Add mounted abbreviation+timezone and abbreviation+name+timezone cases asserting the response revision, persisted revision, timezone and abbreviation; keep same-code-only no-op coverage. Do not merely reread after the current two bumps.

### 2. The uniqueness-index addition breaks an existing required repository test

**Location:** `libs/wbs/adapters/store-sqlite/src/constraint.ts:117`; stale assertion at `libs/wbs/adapters/store-sqlite/src/constraint.db.test.ts:128`.

Adding `projectAbbreviation` changes `UNIQUE_INDEXES` from eleven entries to twelve, but its inventory sanity test still requires eleven. Fresh focused command:

```sh
bun test libs/wbs/adapters/store-sqlite/src/constraint.db.test.ts -t 'is comparing real index lists'
```

Observed **0 pass, 1 fail, 8 filtered**, expected `11`, received `12`, exit 1. This is a regression introduced by the slice, not an unavailable tool or a deferred feature.

**Fix:** Update the explicit inventory expectation to twelve while preserving the non-vacuity check, then run the complete focused `constraint.db.test.ts` suite. Keep the real migrated-index comparison and mounted conflict-translation proof.

### 3. The import exhaustion tests can pass while the refused import commits directory writes

**Location:** `apps/wbs/be-01/src/controller/project-address.controller.db.test.ts:39` (snapshot), used at lines 192–205 and 227–263; production rollback decision at `libs/wbs/application/core/src/module/plan-import/plan-import.feature.ts:367`.

**Requirement:** The task brief requires whole-import rollback, and R5 requires a production-path negative for changed safety checks. The implementation report claims directory rollback as part of the exhaustion proof.

The shared snapshot contains only `project`, `project_abbreviation`, the counter, project ownership, steps and organization audit. Import creates directory entries and relationships before reaching project allocation. The inner project transaction can roll back perfectly while the enclosing import incorrectly commits those prior writes; neither the snapshot nor the 409 assertion detects that defect.

This was verified without editing source or the worktree. A runtime wrapper around the composed test harness's unit of work changed `commit` to `true` only when `decision.value.value.code === 'abbreviation_exhausted'`, then called the mounted import endpoint with the same `planDocumentFixture()` and exhausted counter. Output:

```json
{
  "injected": true,
  "imported": {
    "status": 409,
    "body": { "error": "abbreviation_exhausted", "path": "project", "detail": null }
  },
  "suppliedSnapshotUnchanged": true,
  "leakedPeople": [{ "name": "fad89981-be43-4f98-99fe-9cd2824e1aba" }],
  "leakedServices": [{ "name": "b22b8084-1d72-4477-a101-90af1054ff0e" }]
}
```

Those physical names are generated storage identities for newly created directory entries. Both status and every current snapshot assertion remained satisfied despite the leak. A preceding unmodified probe confirmed actual counter-exhaustion import currently returns 409 with directory tables unchanged; this finding is a demonstrated proof gap, not a claim that the present rollback implementation leaks.

**Fix:** Snapshot all tables the import can mutate before allocation, including directory entities, organization mappings, association tables and relevant durable event/history state (or use an existing complete store snapshot helper). Seed genuinely new directory names in both exhaustion cases. Independently bypass the enclosing rollback decision and watch the strengthened mounted test fail on leaked rows. Add the adjacent `Proof:` comment to the creation-refusal rollback branch and record that observed failure. Merely asserting no project exists cannot establish whole-import rollback.

## Minor findings

None separately raised.

## Evidence assessment and limits

- Inspected the supplied successful focused-test logs, including the final 55-pass/194-assertion controller/repository/audit batch, and the reported typecheck/lint evidence. These are implementer evidence, not independently rerun full suites.
- Inspected the grammar, conflict, namespace, organization, parent-audit and audit-exemption mutation logs. They contain the expected assertion failures (422 versus 200, 409 versus 500, namespace 500 versus 200, foreign viewer 404 versus 403, unchanged audit time, and the named invalid exemption). These are meaningful negatives for the named checks. The grammar mutation returned the old abbreviation while allowing the name patch, which still correctly demonstrates that bypassing boundary rejection lets an invalid request succeed.
- The initial Nx socket-refusal exit 0 was explicitly excluded by the implementer and was not counted as evidence here.
- Fresh review probes: the decoder rejected a trusted trailing-newline code; mounted combined timezone PATCH reproduced finding 1; normal counter-exhaustion import preserved directory rows; forced outer commit reproduced finding 3. The first fault-wrapper probe matched the wrong nesting level, reported `injected:false`, and is not negative-proof evidence; the corrected wrapper reported `injected:true` above.
- Fresh focused constraint test failed as stated in finding 2. `git diff --check 3fd1d9dce..695869a1e` passed and the worktree remained clean after probes. Harness databases were temporary and closed; no repository source, index, HEAD or branch was changed.
- No full gate, build, full frontend/browser suite, migration/secrets CI, deployment or strict-client rollout rehearsal was run. Backend-before-strict-client and rollback ordering are stated in updated design D2 but are operationally unverified here.
- External lookup, dependency authoring/graph integration, component label invalidation, the abbreviation editor UI, external document versioning and deployment activation are explicitly later slices. They are not missing task-2.2 work. The coordinated endpoint `projectId` import additions are preparatory and do not establish external-import completion.

Resolve the three Important findings and rerun the affected focused suites before accepting task 2.2.

## Scoped round 1 re-review — 275826068

Reviewed the six-file fix from `695869a1e` to frozen clean commit `27582606826738ba1a796d9f22be1ba87a90a2bd`, its generated review package, appended implementation report and cited proof logs. This section supersedes the original request-changes verdict for these findings.

| Original finding                                   | Verdict       | Review evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Combined timezone patch double bump/stale reply | **Addressed** | `ProjectPatch` now includes timezone, and `ProjectService.updateWithin` retains it in the validated patch sent through the existing authorized store write. SQLite's existing field spread puts timezone in the same parent UPDATE, audit stamp and revision bump as abbreviation; the resource no longer performs a second `setTimezone`. The store rereads the project, and `zoned` adds the stored timezone without using an intermediate revision. Both new mounted cases assert response, SQL and subsequent GET revision 1, with/without a name change. The RED log shows both tests catching the original persisted revision 2; the final GREEN contains both passing. Standalone/import `setTimezone` remains available. The memory fixture now retains timezone and its single revision change through this path. |
| 2. Stale uniqueness inventory count                | **Addressed** | The explicit expected inventory is twelve. The real migrated-index iteration, positive step-index count and two-column width assertions remain. The complete constraint suite is included in the final passing batch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3. Import rollback proof blind spot                | **Addressed** | The snapshot now reads every SQLite table, preserving table identity and canonicalized rows, including directory entities, ownership/association tables, events/history, allocator and SQLite bookkeeping. Both exhaustion imports supply fresh directory names. The mutation log records two failures after forcing the creation-refusal outer decision to commit, with leaked directory, organization mapping and `person_team` rows. The production branch is restored to `commit:false` and carries the adjacent observed `Proof:` comment. Both strengthened cases pass in the final batch.                                                                                                                                                                                                                           |

**New findings within the six-file fix: none. Spec verdict: the reviewed task-2.2 requirements are satisfied. Overall approval: approve this slice for integration, subject to the repository's eventual required gate.** This does not approve completion or release of the full feature or its remaining slices.

Evidence inspected: `/tmp/puni-cross-api-r1-timezone-red.log`, `/tmp/puni-cross-api-r1-mutation-import-rollback.log`, `/tmp/puni-cross-api-r1-final-tests.log` (**52 pass, 0 fail, 259 assertions**), `/tmp/puni-cross-api-r1-types.log` (fresh core/modules, memory and SQLite checks; cache skipped), empty lint log and successful Prettier log. Fresh review `git diff --check 695869a1e..275826068` passed; HEAD and the clean worktree matched the frozen revision. No proved suites were rerun, no code/index/HEAD was changed, and no full gate, build or deployment was attempted. Earlier operational and cross-slice limits remain.
