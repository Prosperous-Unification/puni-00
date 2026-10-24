# Task 9.2 persisted remote relationship type edit

Bounded frontend packet based on `729571a7d882e67fc5938cc38bd00897d5f5b7c1`, verified on `pop-os` in isolated managed worktree `/home/df/.codex/worktrees/685b/puni-00`. Parent task 9.2 stays unchecked.

## Behavior

Desktop and phone captured relationship details offer FS/SS/FF and Save only when the successor belongs to the displayed project. Save uses the existing update command and relationship ID. Project/work-item/scope/step coordinates remain fixed; no discovery, resolution, Add or endpoint/scope controls are introduced. Foreign-owned relationships remain details-only even when work-item IDs collide across projects. Existing navigation, captured words, removal and production dormancy remain intact.

An inactive-authority HTTP409 still displays the existing readable refusal and retains the selected type. Pending Save disables duplicate submission. Reopening the same target creates a fresh gesture; its old completion cannot close that gesture. A withdrawn relationship renders the existing stale-edit refusal.

## Commands and results

- `bun install --frozen-lockfile`: 1493 packages installed from the locked graph. The initial sandbox attempt reported EROFS; the authorized isolated-worktree installation passed.
- Frontend baseline: `TZ=UTC bunx vitest run src/components/wbs/persisted-remote-dependencies.test.tsx --no-file-parallelism --maxWorkers=1 --testTimeout=30000`: 35 passed before changes.
- Test-first red: missing Relationship/Save failed the newly added desktop/phone cases. The first root-cwd invocation failed alias collection and was corrected to frontend cwd. The retained red has 17 failures/38 passes: 16 missing-control failures plus one overbroad desktop Save query subsequently scoped to its dialog. See [red output](evidence/persisted-remote-edit/red.log.txt).
- Expanded persisted suite: 69 passed, including 18 exact endpoint/relationship-type writes, real HTTP409 refusal, owner collision, successor node, keyboard, stale-session/relationship and removal cases. The stronger repeated-target gesture tests also passed independently (2 selected).
- `NX_DAEMON=false bunx nx show project wbs-fe-01 --json`: passed and populated the project graph before final lint.
- Changed-file `NX_DAEMON=false bunx eslint` over `dependency-navigation.tsx`, `dependency-selection.ts`, `persisted-remote-dependencies.test.tsx`, `plan-cards.tsx`, `plan-columns/depends.tsx`: final exit 0, no output or skipped-boundary warning. Initial lint findings were corrected before this run.
- `bunx tsc --build --force apps/wbs/fe-01/tsconfig.json`: final exit 0, no output.
- `./node_modules/.bin/openspec validate --all --json`: 271/271 passed (253 changes, 18 specs).
- Final frontend-cwd regression command: `TZ=UTC bunx vitest run src/components/wbs/persisted-remote-dependencies.test.tsx src/components/wbs/typed-dependency-editor.test.tsx src/components/wbs/scoped-dependency-editor.test.tsx src/components/wbs/remote-dependency-editor.test.tsx src/components/wbs/dependency-autocomplete.test.tsx src/components/wbs/depends-card.test.tsx --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000`: 6 suites, 158 tests passed in 81.34s on restored production code; [output](evidence/persisted-remote-edit/final-tests.log.txt).
- Scoped Prettier check of the five changed frontend files, this record and the fault summary: passed. `git diff --check`: passed.

## Watched R5 production faults

Every mutation was restored in a finally block before the next run. All 13 watched runs exited 1 with assertion failures; no fault passed or failed collection. Output with trailing whitespace normalized and [the machine-readable summary](evidence/persisted-remote-edit/faults.json) are retained beside this record.

| Fault                                          | Selected production-path observation                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Retired completion fence removed               | Both mounted reopened editors disappeared after the old completion (2 failed); repeated again under the stronger same-target gesture (2 failed). |
| Native-select ArrowLeft guard removed          | Both mounted relationship selectors lost focus (2 failed).                                                                                       |
| Desktop owner check forced true                | Foreign successor with a colliding work-item ID exposed Relationship/Save (1 failed).                                                            |
| Phone owner check forced true                  | Same foreign-owner leak on phone (1 failed).                                                                                                     |
| Desktop removed-relationship guard bypassed    | The stale relationship alert was absent (1 failed).                                                                                              |
| Phone removed-relationship guard bypassed      | The stale relationship alert was absent (1 failed).                                                                                              |
| Persisted project replaced by owner project    | The mounted remote-node SS update had the wrong endpoint payload (1 failed).                                                                     |
| Missing step-identity throw removed            | The actual production serializer produced a write coordinate rather than throwing (1 failed).                                                    |
| Unknown relationship coerced to FS             | Rendering the actual captured component stopped rejecting SF (1 failed).                                                                         |
| Desktop gesture key reduced to relationship ID | The prior pending completion closed the repeated same-target editor (1 failed).                                                                  |
| Phone gesture key reduced to relationship ID   | Same stale completion on phone (1 failed).                                                                                                       |
| Save forced enabled while pending              | Both mounted duplicate-Save assertions failed (2 failed).                                                                                        |

The missing-step test directly calls the production serializer; the unknown-type test renders the production details component. Other faults run through mounted table/phone production paths. New/changed production checks carry adjacent `Proof:` comments.

## Limits

No push, merge, deployment, h2/h4 gate, broad Nx gate, browser/e2e test, backend test or frontend bundle build was run in this bounded packet. No h1claw build/test was used. Production activation and backend authorization were not changed. API-call spies prove editor serialization and the HTTP409 test uses the real API wrapper; this packet does not prove accepted backend persistence, database history or deployed authorization. The full frontend test suite and module-wide typecheck targets were not run; the selected editor suites and frontend tsconfig build are the scoped evidence. The existing Vite native-config `__dirname` warning remains visible in test logs.
