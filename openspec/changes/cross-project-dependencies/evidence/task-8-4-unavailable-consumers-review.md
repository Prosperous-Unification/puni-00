# Unavailable connected consumer packet — independent review

Reviewed `21f59ddec0f7e643c0104e552b06ef8c7ab85783` against base `5de47861a51a2c3cb5da30b5d38252fed4adf048` in `/tmp/puni-unavailable-aggregate`, following `/tmp/puni-unavailable-tree-architecture.md`. Source checkout remained clean; no source edits or fault injections were made during this review.

**Decision: APPROVE as a bounded backend integration packet. REJECT standalone merge/release readiness.** No blocking defect was found in the claimed backend consumer scope. One concrete frontend integration blocker remains, explicitly deferred by the packet. Tasks 8.4 and 9.2 must remain open.

## Severity-ranked finding

**P1 — The new load reason must acquire its frontend presenter before the integrated candidate can pass typecheck or render the reason correctly.** `libs/wbs/domain/contracts/src/http/person-load-shapes.ts:26` adds `dependency_calendar_missing`, while `apps/wbs/fe-01/src/components/people/person-load-page.tsx:35` still declares an exhaustive `Record<UnavailableReason, string>` with only the old three entries. Fresh frontend typecheck exits 2 with TS2741 at that declaration. At runtime the new valid response reaches `REASON_WORDS[project.reason]` at line 205 and has no explanatory text. Add the named reason text and a mounted page regression in the frontend integration slice. This is a new downstream requirement of this packet, not a backend mapping defect. Other frontend scheduleError assignment errors also remain from the unavailable-tree base.

The packet's evidence explicitly discloses the missing frontend presenter, so this finding does not contradict its bounded claim or require undoing the backend changes. It does prevent treating this SHA as independently ready to merge or deploy.

## Backend assessment

- Person load deliberately maps structured `ScheduleError` objects to their closed coarse `kind` codes, preserves local string reasons, and returns before booking derivation. The mounted person and organization endpoints show no bookings, overlap, or weekly booked work for missing-calendar, calendar-range, and both engine-unavailable reasons. Assignment filtering remains unchanged.
- Tree and space response contracts share the exact ArkType schedule-error shape. Contributing project lists are nonempty, calendar identities include captured labels, and engine/reason literals remain constrained. The new contract suite rejects incomplete and invented evidence through the actual endpoint response schema.
- `RollUpTree` and `ProjectRollUp` carry the domain `ScheduleError`; DTO version rises to 2. Connected unavailable roll-ups report `displayed: null`, including connected calendar-range failure. Current ready status, accounting totals and counts survive, and dates are null. Existing local displayed-engine strings are preserved.
- Connected trees are excluded from both isolated target-only cache stores. The mounted witness restores and removes only the remote anchor; target bookings and roll-up dates recover to the asserted dates, then disappear again. Scheduled connected reads are also excluded from these stores, which matters for the second transition.
- The four added mounted cases use `OrganizationHarness.openComposedWith`, real persisted external relationships, real tree capture/presentation and mounted person-load/space endpoints. They do not replace the tree service with a spy. They explicitly disable shared capacity, and therefore do not pretend to exercise a shared connected aggregate producer.
- The shared producer remains explicitly unsupported at `libs/wbs/adapters/store-sqlite/src/chain-snapshot.ts:507`; `sharedTreesWithin` still understands only its existing shared aggregate entries. Evidence and unchecked task markers accurately retain this limitation. There is no false aggregate-completion claim.

## R5 evidence checked

Inspected all five supplied `/tmp/aggregate-fault-*.log` files and their adjacent production `Proof:` comments. Their observed failures match the recorded independent faults:

1. Passing structured load reasons through unchanged causes mounted HTTP 500 instead of 200.
2. Restoring the unconditional Fast fallback produces `displayed: 'fast'` instead of null in all four mounted cases.
3. Restoring connected load caching leaves Target unavailable after the remote anchor returns.
4. Restoring connected roll-up caching leaves Target dates/displayed null and stale missing-calendar evidence after recovery.
5. Replacing the roll-up schedule-error schema with `unknown` makes malformed evidence yield no validation issues.

These are implementation-author fault runs inspected by this reviewer, not newly executed mutations. The reviewer independently reran their restored production paths as part of the passing regression suites.

## Fresh verification

- Eight focused Bun suites named in the packet: **96 passed, 0 failed, 490 assertions**, including all four new mounted cases. Output: `/tmp/unavailable-aggregate-review-tests.log`.
- `bunx tsc --build --force apps/wbs/be-01/tsconfig.json`: **exit 0**, covering referenced backend/core projects. Output: `/tmp/unavailable-aggregate-review-be-tsc.log`.
- `node_modules/.bin/openspec validate cross-project-dependencies --strict --json`: **exit 0**, one valid change, no issues. Output: `/tmp/unavailable-aggregate-review-openspec.log`.
- `bunx tsc --build --force apps/wbs/fe-01/tsconfig.json`: **exit 2**, including the P1 missing reason mapping and existing unavailable-tree frontend union mismatches. Output: `/tmp/unavailable-aggregate-review-fe-tsc.log`.
- `git diff --check 5de47861..21f59ddec`: passed. Final HEAD matched the requested SHA and `git status --short` was empty.

Not run by this review: full lint/format/build/CI, browser or frontend mounted tests, new mutation runs, shared connected aggregate implementation/dedup proofs, exact-SHA host gate, release or deployment. This approval establishes only the bounded backend consumer packet, not task 8.4/9.2 completion or candidate delivery readiness.
