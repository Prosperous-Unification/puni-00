# Task 8.4a scheduled Fast tree read checkpoint

This packet wires `treeWithin` and `tree` to the detached connected projector,
reuses the ordinary row/accounting presenter, selects captured component readiness
and the target's affine placement, and exposes incident authored links under
`connectedDependencies`. The HTTP contract validates each captured navigation
identity. Ordinary local/shared projection and announcement order are retained.

This is a scheduled Fast checkpoint. Task 8.4a and 8.4 remain unchecked.
Missing-calendar, cycle/calendar-range and optimized connected availability still
throw at this presenter; they need an inspectable typed availability contract and
client rendering. Retained reads/arrangement, aggregate load/space, optimizer
admission and component fanout remain separate work. This packet establishes no
frontend relationship presentation or activation readiness.

## Observed checks, 2026-10-22

- Initial mounted full tree test failed HTTP 500 at the existing `treeWithin`
  connected projection refusal; restored connected projection answers HTTP 200.
- `bun test apps/wbs/be-01/src/controller/cross-project-live.controller.db.test.ts`:
  4 passed, 0 failed. Full, paged and detail target placement is 1.5→4 days when
  a 2.5-day remote predecessor begins one workday before the target anchor.
  Incoming/outgoing incident identities and remote direct blockage roots survive.
  The malformed captured endpoint case intentionally reports a boundary error.
- Focused regression command selected mounted connected reads, connected capture,
  chain snapshot, work-item paging and work-item service tests: 185 passed,
  0 failed across five files. An accidentally supplied nonexistent module-level
  arrangement path collected no cases; the correct service path was run separately.
- Arrangement service, resource scheduling controller and pure projector regression command: 33 passed, 0 failed across three files. The pure projector at c103ed3 was provisional during that run. After importing corrected pure 31ba25f29, mounted plus pure projector suites passed 27 tests, 0 failed across two files; core/contracts/backend TypeScript builds were rerun successfully.
- `bunx tsc --build --force libs/wbs/application/core/tsconfig.json libs/wbs/domain/contracts/tsconfig.json apps/wbs/be-01/tsconfig.json`:
  exit 0, no diagnostics.

## Watched production faults

Each fault was injected independently, observed and restored before green runs:

- Replace component statuses with the target-only fold: the mounted remote-held predecessor case reads ready instead of blocked_by_proxy.
- Replace component node projection with target-only `projectNodeReadings`:
  mounted remote blockage test fails because `blocked_by_proxy` and the remote
  stable root disappear.
- Replace the selected captured schedule with `schedule` using the actual local
  canonical input arguments: mounted full/paged/detail test fails on 0→2.5 instead
  of 1.5→4. The first attempted mutation supplied the wrong scheduler signature
  and produced a TypeError; that invalid experiment is not the claimed proof.
- Widen captured endpoint `projectId` from string to unknown in the real response
  contract: mounted malformed navigation identity test answers 200 instead of
  the required 500.

## Claim witness prerequisite and remaining verification

A nonassigning governed claim witness was authored and run against base 5229c8322
plus this packet. It fails before announcement in the existing local
`statusReadsOf` path (`no work item ... in this plan`). That failure is preserved,
not suppressed. The witness is saved at `/tmp/puni-connected-claim-witness.ts`;
its prerequisite is the independently owned 6.3 corrected admission packet
`a34bfb73e87bc741c55c0a61bcab58d36a1fe74c` or its reviewed successor. To run on a
combined checkout, append that fragment to this mounted test file, change the
fixture's `open` to accept `ComposedHarnessOptions` and use
`OrganizationHarness.openComposedWith(options)`, import that options type, then run
`bun test apps/wbs/be-01/src/controller/cross-project-live.controller.db.test.ts`.
The fragment holds push delivery and checks persisted claim/progress, no assignment
or occupancy, one journal entry, own-project durable event and writer release.
It is an unverified witness until run successfully on the combined head.

Changed-file ESLint initially passed with Nx boundary rules skipped because the fresh clone had no project graph. A later `NX_DAEMON=false bunx nx show project wbs-core --json` generated the graph successfully using in-process fallback after socket denial; final changed-file lint exited 0 with no diagnostics. Changed-file Prettier and `git diff --check` passed.

A complete copy-ready witness is also saved at `/tmp/puni-connected-claim-mounted.controller.db.test.ts`: copy it over the mounted test path on a disposable combined checkout and run the command above.

Canonical exact-SHA host gate, full CI/build, browser acceptance, frontend
availability/render checks and OpenSpec-wide validation were not run here.
