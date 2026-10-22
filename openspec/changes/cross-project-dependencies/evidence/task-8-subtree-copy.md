# Task 8.2 bounded subtree copy evidence

Implementation base: `351ce5d43adf6dd2d5ffd28085ce31800008187d` in isolated
`/tmp/puni-external-copy`; no shared feature checkout, push, deployment or host gate.
The whole-project export/import obligation remains pending task 8.1. Task 8.2
stays unchecked. Production external authoring remains inactive; active positives
below use the explicitly named admitted semantic copy fixture only.

## Behavior

`selectCopiedDependencies` selects successor-owned copied tasks using scoped
project/work-item identity. `remapCopiedDependency` assigns fresh relationship
identity, remaps internal work-item/step identities, and detaches retained local
or remote prerequisites. Legacy outgoing dependencies retain their previous
omission policy. Outgoing foreign-owned typed rows are never copied or edited.

`duplicate` validates selected source endpoints under the current bound dependency
context and checks current authoring capability before writes. It validates the
complete resulting owner override through the existing connected graph reader.
One subtree insertion and its new typed links share the existing command UoW.
Its touched set includes copied rows and retained local predecessor rows;
`before` remains the pre-copy owner tree. Remote before revisions are captured
before any copied edge writes and deduplicated by the existing evidence reader.
Compensation removes links before rows and restores rows before the same link IDs.

The existing production command runner may publish `elsewhere_changed` durable
notifications after an outgoing-only copy. Tests require unchanged foreign
business rows, relationship audit, command journals and plan events; they preserve
that notification behavior.

## TDD and checks

- Helper initial stub: `bun test libs/wbs/application/core/src/module/work-item/copy-typed-dependencies.test.ts`
  — 0 pass / 13 fail on selection, exact remaps and missing trusted maps.
- Changed mounted local prerequisite expectation before orchestration change:
  `bun test apps/wbs/be-01/src/controller/typed-dependency-copy.controller.db.test.ts`
  — 2 pass / 1 fail, relationship count 8 rather than 9.
- Restored helper plus mounted local copy: 16 pass / 0 fail. Local test reads real
  persisted preconditions and requires exact retained `X` before/expected revision
  and copied-row touched identity set, then undo/redo with stable copied IDs.
- `bun test apps/wbs/be-01/src/controller/cross-project-dependency-copy.controller.db.test.ts`
  — 25 pass / 0 fail, 368 assertions. These include active admitted semantic
  FS/SS/FF copy, restricted predecessor read without edit, exact local/scoped
  revisions, source links unchanged, fresh creation audit, owner-only history,
  dormant mounted 409, outgoing-only foreign business/history invariance,
  current queued membership refusal, source absence/foreign/unreadable/step/shape
  evidence, failed graph read, post-first-link and journal failure rollback,
  later resolved cycle rolling back the copy, retained batch refresh, stable
  undo/redo, remote and another actor's local stale edits, redo current project/step
  ownership checks, missing history evidence, ordered same-row nodes and self-node.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:typecheck`
  — passed, both module and build checks, 2m 3s. Default Nx invocation was refused
  by sandbox Unix socket permissions; no daemon/plugin socket override was granted.
- `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json` — passed. The repository
  reference-only tsconfig itself checks zero files and is not counted as proof.

The seven-file focused/shared regression run initially reported 236 pass / 1 fail
in `plan-commands.test.ts`: its pre-existing spread of a retained typed store
invokes its intentionally throwing `incidents` getter before commands execute.
Restoring `work-item.resource.ts` byte-for-byte to base HEAD and rerunning only
`lets a later command read the committed FF type after an edit` reproduced the
same failure (0 pass / 1 fail). A separate test-only follow-up repairs that fixture;
this copy packet does not weaken the production getter.

## Independently watched mutations

Each caught fault below was injected alone into production, the named entry
point was run, the fault was restored, and that subset was rerun green. The
separately identified survived collector fault is explicitly excluded from
these success claims.
Detailed local logs are `/tmp/copy-proof-<fault>.log` and
`/tmp/copy-proof-<fault>-restored.log`; these paths are execution artifacts only.

| Fault                                       | Observed failing assertion                                                                                                                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Successor filter changed to incident OR     | Helper exact selected relationship list included outgoing rows                                                                                                                                                   |
| Select only both-inside endpoints           | Mounted local copy returned 8 links instead of required 9                                                                                                                                                        |
| Reuse source relationship identity          | Exact helper copied identity differed from `new-id`                                                                                                                                                              |
| Use work-item ID without project in map     | Exact retained remote endpoint identity changed                                                                                                                                                                  |
| Keep original internal step                 | Exact internal node step identity failed                                                                                                                                                                         |
| Remove trusted successor owner guard        | Real admitted corrupt-owner test failed its exact expected ownership throw; pure guard case also failed                                                                                                          |
| Remove required successor map guard         | Required absent successor stopped throwing                                                                                                                                                                       |
| Remove required step map guard              | Required absent step stopped throwing                                                                                                                                                                            |
| Omit retained local endpoints from touched  | Mounted exact `from[X]`/touched precondition assertion failed                                                                                                                                                    |
| Drop external before evidence               | Real semantic copy threw `journal external revision coverage is not exact`                                                                                                                                       |
| Bypass current external capability          | Actual mounted dormant copy returned 200 instead of 409                                                                                                                                                          |
| Skip copy source evidence                   | Absent-row modeled refusal progressed to `recording external revision evidence is no longer readable` throw                                                                                                      |
| Skip duplicate resulting-state graph        | Injected graph-read failure incorrectly resolved a successful copy                                                                                                                                               |
| Commit on exception instead of rollback     | Post-first-link and journal-failure all-table equality failed                                                                                                                                                    |
| Commit modeled refusal instead of rollback  | Later real resolved-cycle refusal left the preceding copy; all-table equality failed                                                                                                                             |
| Publish collector announcements immediately | SURVIVED: WorkItemService.collect folds tree notifications into its dirty flag before AnnouncementCollector is called; restored afterward. This fault does not prove publication timing in the semantic fixture. |

The semantic fixture's no-released-broadcast assertion confirms observed output,
but the surviving lower collector mutation exposes its coverage limit. Existing
real command-runner tests cover post-commit publication. No new publication
implementation or safety guard is introduced by this packet.

Full host gate, activated production external copy, whole-project external
export/import and mounted MCP copy equivalence are unverified here. No synthetic
production activation or second project-copy endpoint was introduced.

Final focused regression after restored mutations: `bun test` over
`work-item/{copy-typed-dependencies,work-item.resource,duplicate-step-parallel}.test.ts`,
`typed-dependency-copy.controller.db.test.ts`,
`cross-project-dependency-copy.controller.db.test.ts`,
`duplicate-step-parallel.controller.db.test.ts`, `plan-import/module.test.ts` and
`http/elysia/plan-document-boundary.test.ts` — 214 pass / 0 fail, 935 assertions.
Scoped ESLint over all six changed/new TypeScript files passed with the Nx
project graph present. Backend spec typecheck was rerun after the final test
additions and passed. `bunx openspec validate cross-project-dependencies --json`
passed with no issues. Full shared regression retains the separately reproduced
baseline fixture failure until the follow-up commit.
