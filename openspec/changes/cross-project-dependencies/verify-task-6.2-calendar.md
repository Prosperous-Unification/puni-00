# Task 6.2 mounted calendar packet

Bounded acceptance on base `5582546a53ec5d1c22d181180f13a0c5fe006e1c`.
Production code is unchanged. Parent task 6.2 remains open.

`connected-calendar.controller.db.test.ts` reads the mounted Elysia route over
real migrated SQLite through `OrganizationHarness.openComposedWith`, stored
synthetic dependency authority, and optimization disabled. Each case runs in
isolated and shared people modes. There are no assigned people in this packet;
this proves calendar behavior under both configured modes, not contention.

The independent oracle uses Monday 2026-10-19 and Wednesday 2026-10-21:

- A 2.5-day Monday predecessor finishes at 2.5; Wednesday's FS successor starts
  at 0.5 and finishes at 3 in its own coordinates. Both project targets retain
  the incident relationship, exact numeric boundaries and expected calendar dates.
- A one-day predecessor cannot move Wednesday work before Wednesday day zero.
- Saturday 2026-10-24 manual start rolls forward to Monday 2026-10-26, giving
  Wednesday offsets 3 to 5.5 and calendar completion Wednesday 2026-10-28.
  Sunday 2026-10-25 deadline rolls back to Friday; the slice reports `lateBy: 3`.
- An unrelated undated project with a work item does not make connected
  placement unavailable. Removing Monday's anchor produces an explicit named
  `dependency_calendar_missing` from either target, retaining incident links,
  node readings and null schedules/dates with no partial slices.

## Watched production faults

Each mutation was applied alone, the full mounted file was run, and original
production source was restored in `finally`. Logs live in
[evidence/mounted-calendar](evidence/mounted-calendar).

| Mutation                                                           | Observed outcome |
| ------------------------------------------------------------------ | ---------------- |
| Replace every member anchor with the Wednesday project anchor      | 2 pass, 6 fail   |
| Remove the surviving-leaf project-floor loop                       | 6 pass, 2 fail   |
| Round projected `earliestStart` after subtracting the member shift | 4 pass, 4 fail   |
| Remove the shift from translated deadlines only                    | 6 pass, 2 fail   |
| Default missing anchors to 2026-10-19                              | 6 pass, 2 fail   |
| Replace backward weekend deadline roll with forward roll           | 6 pass, 2 fail   |

An initial ineffective anchor mutation referenced a nonexistent target field on
the capture and fell back to the original anchor; all eight tests passed. This
was not counted as proof. The corrected Wednesday-substitution mutation above
changed production values and failed the mounted assertions.

Independent Astra High review inspected all six archived logs and approved the
bounded test packet without a Critical or Important finding. The reviewer
reran 8/8 with 58 assertions. Removing the project floor and defaulting the
missing anchor fail the mounted HTTP status assertion: the former reaches a
negative-offset `addWorkdays` refusal, and the latter reaches the downstream
canonical-stage anchor guard. These show loss of valid presentation or typed
unavailability; neither demonstrates accepted fabricated dates. The two
deadline faults directly change `lateBy` from 3 to 5 or 2.

On the integrated branch, the calendar, mounted live and mounted Fast capacity
suites passed 30/30 with 307 assertions; changed-file ESLint, Prettier and
scoped OpenSpec validation passed. The broader suite, build and host gate
remain unverified.

## Verification

- `bun test apps/wbs/be-01/src/controller/connected-calendar.controller.db.test.ts`:
  8 pass, 0 fail, 58 assertions after restoring all mutations.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:typecheck --skip-nx-cache`:
  passed configured target and its module dependency.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:lint --skip-nx-cache`:
  failed after actual ESLint execution (62s); no ESLint diagnostics were emitted.
  A focused ESLint run then found one unsafe matcher assignment in the new
  test; it was corrected with an `unknown` matcher boundary. The exact cause of
  the silent configured failure remains unverified.
- `bunx eslint apps/wbs/be-01/src/controller/connected-calendar.controller.db.test.ts`:
  passed after the matcher correction.
- The configured lint target was rerun with the same command after correction:
  passed, showing actual ESLint execution and Nx target completion (46s).
- `bunx prettier --check` for the changed test and this report: passed.
- `bunx openspec validate cross-project-dependencies --json`: valid, 0 errors;
  15 existing requirement-length warnings.

The first default Nx lint invocation printed daemon/plugin-worker socket
permission refusals and exited zero before showing lint execution. That exit
was not accepted as verification. The configured rerun disables daemon and
plugin isolation and must show actual ESLint execution and target completion.

No production activation, external authoring rollout, installed optimizer,
Python/image behavior, browser acceptance, saved-plan history, fractional manual
constraint injection or canonical host gate is claimed. Manual dates enter
through the real date-only storage boundary; fractional scheduler boundaries
are observed directly. Unrelated-undated coverage proves exclusion from the
connected component, not the separate local undated read contract. Full backend
suite, build and host gate were not run for this test-only packet.
