## ADDED Requirements

### Requirement: No surface names the old level "project"

After slice 1, no route path, operationId, MCP tool name, realtime subscription or event
name, audit vocabulary value, plan document field, saved-plan input key, SQLite table, view, column,
index or trigger, fe-01 user-visible word or `CONTEXT.md` term SHALL use "project" for one
WBS. The committed `tool-rename-work-package check` SHALL exit 0 on the tree and SHALL exit 1
listing every residual outside its allow-list.

#### Scenario: The generated OpenAPI document is renamed

- **WHEN** `emit-openapi-cli.ts` writes the document after slice 1
- **THEN** no path contains the segment `projects`, no operationId contains `Project`, and no
  schema property is named `projectId`

#### Scenario: The gateway admits the new subscription only

- **WHEN** a connection subscribes to `project:<id>` and another to `work-package:<id>`
- **THEN** the first is refused by the subscription shape check and the second joins the work
  package's presence roster

#### Scenario: A residual fails the check

- **WHEN** a line `const projectId = x` is injected into a file outside the allow-list and
  `tool-rename-work-package check` runs
- **THEN** it exits 1 and lists that path and line; with the line in an allow-listed path it
  exits 0

#### Scenario: New permission tokens do not hide an old argument

- **GIVEN** one line contains a current catalogue permission or new work-package kind and an old planning projectId argument
- **WHEN** the committed rename tool applies and checks that file
- **THEN** only the qualified new-sense character spans remain unchanged; the old argument renames and an injected old residual remains reportable
- **AND** missing or ambiguous required qualified witnesses refuse before path moves or file writes rather than widening a rule

#### Scenario: The parent chain and frozen wire keep their identities

- **WHEN** the current permission ScopeChain and solver boundary pass through the tool
- **THEN** ProjectChain.projectId and WorkPackageChain.projectId remain parent fields distinct from workPackageId, while unrelated old captured planning fields rename
- **AND** both frozen schema copies and the Python0.4.0 implementation/package/image inputs remain byte-identical; mixed TypeScript host-to-wire producers preserve only exact wire keys

### Requirement: Live data migrates in place through the rename

The slice 1 migration SHALL rename every table, column, index and trigger, rewrite
`organization_audit` subject kinds and actions, refuse while a work package lacks an
organization row, and preserve existing content except for explicitly owned package-key projections and audit vocabulary. Existing journal
entries, history events and saved plans SHALL keep working. Command rewriting SHALL follow only recognized compensating-command roots and their owned batch/incident paths; replay authorization, user text and opaque identities SHALL remain unchanged. Malformed owned shapes or old/new-key collisions SHALL refuse the whole migration naming the stored row.

#### Scenario: A migrated dev-shaped store reads the same

- **WHEN** a fixture store with work packages, steps, estimates, claims, calendar markers,
  saved plans and a journal is migrated
- **THEN** every work package tree, startable read, history and saved-plan compare answers the
  same content as before, under the new field names

#### Scenario: Undo survives the rename

- **WHEN** the last batch before the migration moved a row and the same account presses undo
  after it
- **THEN** the move is undone

#### Scenario: An unmapped work package refuses the migration

- **WHEN** one work package has no organization row
- **THEN** the migration fails on its guard naming the count, and nothing is renamed

#### Scenario: Renamed allocator uses its renamed view

- **GIVEN** a migrated store with allocated abbreviations and a valid next counter
- **WHEN** actual work-package creation allocates another abbreviation
- **THEN** the allocator uses `work_package_abbreviation_candidate` with renamed table references
- **AND** existing codes remain unchanged and no old allocator view or old-level schema reference survives

#### Scenario: Owned historical commands change keys without changing authority

- **GIVEN** typed-dependency, incident-transition and subtree-restore commands nested in a batch, external revision preconditions, stable version1 replay requirements, and user text containing projectId
- **WHEN** the store migrates
- **THEN** only the recognized command/dependency/row and external-revision package keys use workPackageId
- **AND** absent legacy endpoint package fields stay absent, replay requirements and user text stay exact, and undo/redo still address the original packages

#### Scenario: Mixed or malformed stored command keys refuse atomically

- **WHEN** an owned historical command has both projectId and workPackageId, lacks a required shape, or uses an unknown command discriminator
- **THEN** migration refuses naming that stored row, with the original schema, complete ledger and all row bytes preserved

### Requirement: Transport replay resets at the subscription namespace boundary

The gateway SHALL refuse legacy project:* subscriptions and authorize current work-package:* subscriptions normally. Namespace reset SHALL leave existing event_log/event_sequencer rows unchanged under the legacy keys; current subscriptions SHALL NOT inherit their cursors or frames. The client SHALL establish fresh anchored state and then use only the current full-subscription sequence key. Durable plan_event user history SHALL remain preserved independently of the transport buffer.

Organization activation SHALL reconcile complete `project:<id>` and `work-package:<id>` storage keys against current work-package ownership without granting legacy replay access. Normal retention and the existing explicit activation orphan cleanup remain available for both known stored namespaces. Cleanup SHALL require its explicit request and an absent live work-package row; live histories and their independent counters SHALL remain exact. Unknown namespaces and live unmapped owners SHALL block activation, and refusal SHALL roll back all provisional cleanup. Durable plan_event history SHALL remain unchanged.

#### Scenario: A persisted old cursor cannot satisfy a new subscription

- **GIVEN** a persisted project:* cursor and old cached frames, including sequence0
- **WHEN** the current client opens the same work package under work-package:*
- **THEN** it obtains a fresh anchored full state, ignores the old cursor even when the new sequence is also0, and later replays only current frames
- **AND** a denied resume/refetch cannot publish or install state as a successful replay

#### Scenario: Activation inventories both stored transport namespaces

- **GIVEN** one mapped live work package has retained project:* and current work-package:* rows with distinct counters and raw messages
- **WHEN** activation reconciles the transport inventory
- **THEN** both exact keys resolve to that work-package ownership without rewriting either history or serving a legacy subscription
- **AND** a live unmapped owner or unknown subscription still produces a conflict naming its original complete key

#### Scenario: Explicit activation cleanup preserves live histories

- **GIVEN** live legacy/current histories coexist with known orphan keys in the log, sequencer, or both
- **WHEN** an operator applies activation with explicit retained-stream pruning
- **THEN** only known orphan keys are deleted and reported once in sorted order, while complete live rows, raw messages, independent next_seq values and durable plan history remain exact
- **AND** unflagged activation refuses on the orphan conflicts without writing

#### Scenario: Unknown streams roll back a flagged activation

- **GIVEN** a known orphan and an unknown or lookalike stream coexist
- **WHEN** activation attempts explicit retained-stream pruning
- **THEN** reconciliation refuses on the original unknown key and the complete logical store remains unchanged, including provisional known-orphan deletions

### Requirement: Persisted runtime identities survive the host rename

Historical runtime declarations, fingerprints, version1 canonical request bytes/digests, accepted envelopes and original receipt bytes SHALL remain unchanged. Named persisted codecs SHALL validate the original format before projecting current internal names and compare retries in the retained record's format. Mixed or unknown formats SHALL refuse. A changed current canonical/public receipt shape SHALL use an explicit next version while retaining version1 decoding and equality. Positional manual-use actor fingerprints and rb1 basis bytes SHALL remain unchanged solely by the property rename. Historical resource-use snapshots/original responses SHALL retain their original state, revision and attribution when projected into current field names.

#### Scenario: A retained runtime retry keeps its original identity

- **GIVEN** a pre-rename admission, event or version1 command acceptance with recorded canonical bytes and digest
- **WHEN** the corresponding current request retries after migration
- **THEN** equality uses the original record's validated format and returns its original receipt without rewriting its digest or consulting deleted planning references

#### Scenario: Runtime formats are validated before projection

- **WHEN** a retained record mixes old and current package keys, has an unknown version or fails its original integrity check
- **THEN** the persisted boundary refuses before replay, mutation or receipt acknowledgement

#### Scenario: Retained terminal proof is trusted state

- **GIVEN** a stored resource-use history event already records release_verified
- **WHEN** a pending cleanup acknowledgment reads its original runtime event identity
- **THEN** the full retained format and producer bytes are validated before extracting proof; missing or malformed terminal kind, digest, locator or planning disposition throws without effects
- **AND** missing or mismatched incoming proof retains its modeled request/conflict refusal

Historical and current host-job readings SHALL validate their full retained declaration identity before projecting only the recorded label, type, host and reservations. No current planning state is reconstructed.

### Requirement: Recovery backups retain their original approval identity

Published shared-people-save version1 SHALL retain projectId rank fields, canonical ordering and its original digest. New saves SHALL emit version2 with workPackageId. Each complete declared generation SHALL validate before hashing and separate current-row projection. Mixed/unknown versions, spellings or undeclared fields SHALL refuse. Existing restore operation, approval, receipt and consumption identities SHALL NOT be rewritten. Host restore and diagnostics SHALL retain the original versioned snapshot and digest across awaits, reading the backup once. Standalone rank recovery SHALL accept exactly project-rank-save/version1/projectId or work-package-rank-save/version2/workPackageId; other pairs SHALL refuse.

#### Scenario: An old pending approval survives the physical rename

- **GIVEN** an outgoing110 version1 backup and genuine personal restore approvals bound to its original digest
- **WHEN** migration111 renames physical package storage and current restore consumes that same backup
- **THEN** every durable evidence row remains unchanged by migration and current membership/permission is rechecked before atomic restoration into current rows
- **AND** an equivalent version2 save cannot satisfy the old operation digest or retarget its approvals

#### Scenario: Completed recovery retries preserve historical facts

- **GIVEN** an original version1 receipt and exact complete approval consumption, followed by later rank or membership changes
- **WHEN** the same original backup and references retry after111
- **THEN** current restore returns the original digest, completion time, counts and approval IDs without replaying writes or rewriting evidence

#### Scenario: Both backup generations compare every saved fact

- **WHEN** a valid historical or current backup is used to remove or restore modes and ranks
- **THEN** separate internal projection preserves all organizations, ranks and audit facts, complete-state equality detects every stale fact, and failures roll back all effects

### Requirement: A window migration runs only inside a proven window

Every non-additive migration of this change (design E39) SHALL carry an explicit
`WAIVERS` entry naming its forbidden statements and the gate `bin/assert-rename-window.ts`,
and `migration-lint` SHALL refuse it while that script is absent. None SHALL rely on the
compatible-rebuild exemption. The gate SHALL pass only when no prod release is recorded,
the application container is stopped, and a backup report written by
`backup-db-cli.ts --report` matches the live database: source path, source sha256 after a
WAL checkpoint, an empty `-wal`, the snapshot's own sha256, and the applied migration
ledger by name and hash. It SHALL refuse a missing, unreadable or malformed report, any
mismatch, and a missing or unreadable state directory, whatever the report says. Every
window migration's `down.sql` SHALL refuse. Before current startup, an explicitly admitted
stopped one-off transition SHALL bind the candidate, store, complete baseline ledger and
permissions 6.4 owner; its successful post-ledger/current-schema validation SHALL precede
startup, health/read verification and supported grant/write exposure. The authenticated
immutable-snapshot read handoff SHALL precede live-store shutdown, and old HTTP/WS
authorizers SHALL retire before upgraded exposure. A verifier, path or raw migrate-cli
invocation alone SHALL NOT authorize this transition. Unknown, failed or interrupted
migration SHALL prevent startup and poller resumption. Snapshot recovery with previous
code SHALL also satisfy permissions 6.4f; possible or unknown upgraded-writer exposure
SHALL NOT automatically restore old-role authority.

#### Scenario: Ordinary startup cannot perform the rename transition

- **GIVEN** an already-authoritative pre-rename store and a current candidate
- **WHEN** ordinary startup is attempted with migration enabled or disabled
- **THEN** strict current-authority inspection refuses before pending migration SQL or application service effects
- **AND** the original durable schema, rows and full applied ledger remain unchanged

#### Scenario: Window evidence alone grants no transition authority

- **GIVEN** a successful backup/verifier but no qualified candidate/store/ledger-bound permissions 6.4 transition owner
- **WHEN** an offline migration or later startup is requested
- **THEN** missing admission refuses before pending SQL, startup or poller resumption
- **AND** old authority is not accepted as current live authority

#### Scenario: A stopped transition validates before startup

- **GIVEN** the supported 6.4 owner, continuous live-store writer exclusion, authenticated read handoff and exact candidate/baseline attribution
- **WHEN** the one-off candidate migration succeeds and the exact expected complete post-ledger and current schema validate
- **THEN** current startup/read verification can proceed under the same owner without applying the rename at boot
- **AND** retained authority/receipt bytes and historical ledger identities remain exact, and old-authorizer retirement precedes upgraded grant/write exposure

#### Scenario: An idle connection does not impersonate a checkpoint blocker

- **WHEN** another connection is idle, the checkpoint completes and the WAL is empty
- **THEN** report generation may succeed after the source and complete ledger rechecks
- **AND** the stopped application and paused poller/heavy-lock procedure still supply the lasting writer barrier

#### Scenario: Report publication preserves competing evidence

- **WHEN** a snapshot or report destination exists or another producer wins its exclusive publication
- **THEN** the competing bytes remain unchanged and the command fails without a successful report
- **AND** a verified snapshot remains available if report publication later fails

#### Scenario: A post-publication failure cannot erase another owner

- **WHEN** report sync or close fails after its final link exists
- **THEN** the wrapper performs no stage deletion or report unlink and preserves the operation and descriptor-close failures
- **AND** possibly published/unknown artifacts and observed staging locations are returned as separate diagnostics, never as success or a promise of absence
- **AND** an unknown snapshot-helper cleanup retains its staging evidence and exact original failure

#### Scenario: Successful report mode makes retained storage visible

- **WHEN** a window backup succeeds
- **THEN** stdout and the report file contain the unchanged eight-field report
- **AND** the operation returns separate artifact metadata and the CLI prints retention diagnostics to stderr for both snapshot and report staging locations
- **AND** the verified snapshot remains usable; retained hard links keep its blocks allocated until explicit operator cleanup under exclusive namespace control
- **AND** reported paths identify created or possibly retained locations, not current ownership or authority to delete a rebound pathname

#### Scenario: A staging pathname is replaced by another actor

- **WHEN** a competing directory replaces an observed staging pathname during publication
- **THEN** the wrapper preserves the competing directory and its bytes without destructive pathname cleanup
- **AND** it reports the observed location conservatively, without claiming that the original inode still occupies it
- **AND** no-flag backup behavior remains unchanged

#### Scenario: Verification never erases WAL evidence

- **WHEN** the readonly verifier encounters a nonempty WAL
- **THEN** it refuses before opening SQLite and does not checkpoint or truncate the WAL

#### Scenario: Snapshot sidecar evidence refuses without changing the report

- **GIVEN** an actual generated backup report and unchanged main source/snapshot files
- **AND** deliberately nonempty snapshot WAL sidecar evidence
- **WHEN** the readonly verifier observes the report
- **THEN** it refuses naming snapshot WAL before opening snapshot SQLite and preserves all evidence bytes
- **AND** this physical artifact rule makes no claim that an ordinary writer leaves a VACUUM snapshot main-file header unchanged

#### Scenario: The candidate verifier cannot be shadowed by dev source

- **WHEN** the Bun gate launches the one-off verification
- **THEN** it uses the explicit immutable candidate image and only pinned readonly DB/report/snapshot mounts with the Bun entrypoint
- **AND** a source bind, unknown image or mount, restarted application, malformed inspection or absent tool refuses the window

#### Scenario: A WAL-only write after the backup refuses the window

- **WHEN** a connection with automatic checkpoints off writes one row after
  `backup-db-cli.ts --report` produced the report, and keeps the connection open
- **THEN** the gate exits 1 naming the non-empty `-wal`

#### Scenario: A checkpointed write after the backup refuses the window

- **WHEN** a row is written and checkpointed after the report was produced
- **THEN** the gate exits 1 naming the source sha256 mismatch

#### Scenario: A report of another database refuses the window

- **WHEN** the report's source path differs from `DB_PATH`
- **THEN** the gate exits 1 naming `sourcePath`

#### Scenario: An unreadable state directory refuses even with a valid report

- **WHEN** the report matches the live database and the state directory cannot be read
- **THEN** the gate exits 1 as unreadable state

#### Scenario: A running application refuses the window

- **WHEN** the report matches and the application container is still running
- **THEN** the gate exits 1 naming the container

#### Scenario: Two drops cannot pass as a compatible rebuild

- **WHEN** slice 3a's `space_holds_projects_people_teams` shape, which drops `project` and
  `space_work_package`, carries the compatible-rebuild marker instead of its waiver
- **THEN** `migration-lint` refuses it on `DROP TABLE`; with its waiver and gate script
  present it passes

#### Scenario: The waiver needs its gate

- **WHEN** `bin/assert-rename-window.ts` is deleted from the tree
- **THEN** `migration-lint` refuses every waived window migration

#### Scenario: A window migration's down script refuses

- **WHEN** `migrate-down-cli.ts` runs a window migration's `down.sql`
- **THEN** it fails on its guard naming the restore step, and the schema and ledger are
  unchanged

#### Scenario: A rehearsed rollback restores the snapshot

- **WHEN** a copy of the dev database carrying non-default settings goes through a window,
  `/health` fails, and the runbook's rollback runs
- **THEN** the restored file's sha256 equals the snapshot's, the ledger equals the report's,
  and every work package reads its pre-window values

### Requirement: Plan document versions preserve both published local and connected formats

Published ordinary11 and connected12 SHALL retain their original meanings and field names through explicit historical readers. Slice1 SHALL export renamed ordinary13 or connected14. Published13/14 SHALL retain their actual owner-bearing work-package responses through independently frozen schema closures. Slice2 SHALL export ownerless ordinary15/connected16 with required workPackage.projectId and informational project: { id, name }, captured with the package, tree and document facts in one source-owned observation in every supported export mode, including pre-activation legacy and scoped isolated/shared/connected, with matching parent identities and actual stored organization ownership. Legacy capture SHALL NOT fabricate scoped human authority. Routes SHALL require the purpose export reader and SHALL NOT fall back to independent later package/tree/document reads. Scoped export SHALL check target package.read in the same observation before topology/capture, retaining the current interim organization/leaf grant hierarchy. Complete shared/connected exports SHALL require every retained chain/component member readable by the same principal in that observation; an invisible required member SHALL return opaque404 not_found without member IDs, counts or permission detail. Evidence SHALL NOT be trimmed, rehashed or rescheduled to bypass that refusal. Legacy export and general read/scheduler algorithms remain separate. Current ownerless capture/input12 support SHALL precede or co-land with all-mode export capture. Slice3a SHALL allocate fresh versions above16 for changed settings shapes; no published version SHALL be reinterpreted. The classifier SHALL retain explicit13/14 support when current constants advance, with connected12/14/16 distinct from ordinary13/15. Full exports SHALL require captured parent metadata; writable15/16 imports MAY omit read-only response metadata and SHALL take their destination from the outer required projectId. Import SHALL read every published supported version through explicit conversion and refuse newer versions with400 unsupported_version. Renamed current endpoints and owned display labels use workPackage names; historical source bytes remain untouched.

#### Scenario: A version 11 file imports as a work package

- **WHEN** a version 11 file whose top-level `project` names timezone `Europe/Kyiv` is imported
  into project P
- **THEN** a work package is created in P with that timezone as its own override

#### Scenario: Navigator reads the new export and the old fixtures

- **WHEN** Navigator turns current ordinary15/connected16 exports and the frozen v7–v14 fixtures into plan
  reference records
- **THEN** each record's plan id is the work package id of its file

### Requirement: Saved plans read across the input schema bump

Current canonical/stored input SHALL be11 after slice1,12 after slice2 and13 after slice3a. Published base9 and stored dependency-history body10 SHALL retain their original meanings through frozen legacy decoders and an explicit10→11 rename projection. The legacy normalizer ceiling SHALL remain9; current11 emission SHALL require captured dependencyHistory, including known-local evidence. Actual input11 grammar and semantics SHALL be frozen independently before fresh input12 writing. Fresh12 SHALL require captured nonempty workPackage.projectId and SHALL contain no owner or creator audit metadata. No stored body SHALL be rewritten. After original byte/hash/header/schedule-link validation, supported historical bodies SHALL project into a detached internal comparison view; original1–11 SHALL carry unrecorded parent evidence and original12 SHALL carry its recorded parent. The projection SHALL NOT consult live parent or creator rows, fabricate raw12, or rehash original identities. Only actually recorded old ownerId, including null, SHALL be retained as retired evidence and compared when both sides carry it.

#### Scenario: An old saved plan still compares

- **WHEN** a saved plan stored before slice 1 is compared with one saved after it, both describing the same captured planning meaning except the sanctioned rename-format changes
- **THEN** the planning diff reports no difference, while each side retains its original format/provenance identity
- **AND** different algorithms, numerical facts, missing/present additive facts, budgets, wire/quantum, solver suffixes, selection or observed outcomes remain differences

### Requirement: A comparison projects only sanctioned rename metadata

After original byte/hash/link/header validation, the saved-side comparison SHALL use a detached pairwise meaning projection. For the rename pair it SHALL remove only the input envelope schemaVersion and compare dependencyHistory only when BOTH original sides captured it (input10 and later); pre10 remains visibly legacy-unknown in per-side summaries. The owner-retirement pair SHALL additionally compare actually captured retired owners only on both sides and parent identities only when both were recorded. Different recorded parents SHALL report reparented at workPackage.projectId; one unrecorded parent SHALL remain provenance uncertainty without a fabricated move. Each comparison side SHALL expose required recorded/unrecorded parent evidence separately from dependency provenance, including when its diff is empty. Generic diffing SHALL continue walking every other field of those projected values.

Only corresponding connected-stage-v1 versus connected-stage-v2 pairs MAY replace stage.stageBytes and ready/certificate question.stageBytes with their validated decoded current packet meaning and omit the corresponding format/inputHash/questionHash from the comparison copy. Exact original strings/hashes remain unchanged in the stored read and provenance summaries. Only the sanctioned18→19 scheduler prefix with an identical solver suffix MAY normalize across that format pair. Same-format identity changes and every other evidence/packet field, observation/variant presence, order, objective, budgetMs, quantum, wireVersion, chosen/proof/state, starts/scores, placement, labels and algorithm identity SHALL remain compared. No engine, live lookup, current writer or derived rehash may produce the comparison projection; original stored hash verification remains required. Unknown added schedule fields SHALL remain visible to the generic walk.

#### Scenario: Same-format identities remain observable

- **WHEN** a valid same-format side changes its packet bytes, questionHash or corresponding inputHash
- **THEN** comparison reports the change and preserves both original identities in its summaries

#### Scenario: A historical parent stays unrecorded

- **GIVEN** valid original input11 and fresh input12 saves already exist with unchanged authored facts
- **WHEN** their live parent or creator rows later change or disappear before comparison
- **THEN** the old side retains unrecorded parent provenance and its original bytes/hash, without consulting current rows or inventing an owner/parent change
- **AND** an empty diff still exposes each side's required recorded/unrecorded parent summary separately from its dependency provenance
- **AND** two original input12 saves with different captured parents report reparented at workPackage.projectId

#### Scenario: Complete export does not reveal unreadable captured members

- **GIVEN** the caller can read the target but cannot read another retained shared-chain or connected-component member
- **WHEN** the caller requests the complete scoped export
- **THEN** export returns opaque404 not_found with no hidden member ID, count or permission detail
- **AND** it does not remove component facts, rewrite retained stage bytes or reschedule a smaller component
- **AND** when every retained member is readable, export preserves the complete captured evidence

#### Scenario: New document metadata is coherent and informational

- **WHEN** ordinary15 or connected16 is exported
- **THEN** workPackage.projectId, project.id and project.name come from the same source-owned capture as the package and tree and agree, with no owner field
- **AND** this holds for pre-activation legacy and scoped isolated/shared/connected exports; missing, malformed or foreign trusted parent state throws
- **AND** a concurrent parent rename cannot combine old package/tree facts with a new parent name; later independent package/tree/document reads are not used
- **AND** mismatched captured parent identities refuse export, while writable15/16 imports may omit read-only response metadata and take the outer body's parent

#### Scenario: A retired owner is compared only on both sides

- **WHEN** two pre-retirement bodies of one work package carry different `ownerId` values, and
  one of them is compared with a version12 body of the same package
- **THEN** the first compare reports a `retired-field` difference and the second reports no
  owner difference
- **AND** other changed authored facts remain compared

### Requirement: A project is an organization's named collection of work packages

`POST /api/projects` SHALL create a project with a unique name within the organization,
and with `workPackage: { name }` SHALL create the project and its first work package in one
transaction; the same transaction SHALL write the creator's `project-manager` grant, with a
work package the creator's `package-manager` grant on it, and the audit rows
`project_created` and one `access_granted` per grant, so that either all of them commit or
none does. `PATCH` renames a project; `DELETE` removes it only while it holds no work
package, the organization's only project included. Every work package SHALL reference
exactly one project of its own organization, enforced in storage. `POST /api/work-packages`
and the import route SHALL refuse `422 project_required` when `projectId` is missing or
`null`, `422 invalid_body` when it is malformed, and `404 not_found` when it names no
project of the caller's organization. The import body SHALL be `{ projectId, document }`;
the document's own project fields SHALL be informational.

Every current create/import API, including an explicitly legacy internal call, SHALL require
an explicitly supplied nonempty parent ID. The actual queued owner SHALL revalidate current
admission and resolve that parent in the scoped organization or the actual preactivation
legacy organization whose bridge maps the package. It SHALL NOT choose a first, migrated,
automatically created or document-derived parent. Missing and foreign parents SHALL have
the same not-found outcome. Missing/malformed trusted marker or legacy organization SHALL
throw. Existing preactivation package/import admission SHALL remain usable with a valid
explicit parent; activated unbound and preactivation delegation refusals SHALL remain
unchanged. This SHALL NOT admit legacy engagement-project CRUD or change scoped grant and
credential policy.

#### Scenario: Duplicate name

- **WHEN** an admin creates two projects named "WBS product" in one organization
- **THEN** the second answers `409 name_taken`

#### Scenario: Delete refuses a non-empty project

- **GIVEN** the caller can read work packages W1 and W2
- **WHEN** that authorized caller deletes their project
- **THEN** it answers `409 not_empty` with `workPackageIds: [W1, W2]` and nothing changes

#### Scenario: Project mutations refuse malformed trusted revisions

- **GIVEN** an admitted project whose stored revision is negative, absent, null,
  nonnumeric, fractional or outside the safe integer range
- **WHEN** the project is renamed or deleted through SQLite or the Memory twin
- **THEN** the write throws before arithmetic, duplicate-name or nonempty outcomes,
  preserving project, package, grant and audit state
- **AND** zero and the highest safely advanceable revision remain valid; advancing a
  valid maximum still refuses overflow, with the existing modeled refusal precedence
- **AND** absent and foreign projects keep their opaque not-found outcome

#### Scenario: Project responses do not disclose hidden children

- **GIVEN** current project access and deletion permission, readable child W1 and hidden child W2
- **WHEN** the caller lists or reads the project, or receives a successful rename response
- **THEN** child entries/counts reflect only readable actual children in the same admitted observation as current authority
- **WHEN** that caller deletes the non-empty project
- **THEN** the same write owner refuses `409 not_empty` with only `workPackageIds: [W1]` and no hidden total
- **AND** if every actual child is hidden the refusal still occurs with `workPackageIds: []`, with no project/grant/audit effects

#### Scenario: Project deletion preserves direct organization governance

- **GIVEN** an empty project and no current member with a direct user built-in org-super-admin grant at organization scope
- **WHEN** the project is deleted, including when it has zero project grants
- **THEN** the same owner refuses with409 last_super_admin and rolls back project deletion, grant revokes and audit writes
- **AND** group, credential and custom equivalent authority do not substitute for a direct built-in holder

#### Scenario: A work package cannot point across organizations

- **WHEN** a row insert gives a work package of organization A a project of organization B
- **THEN** the trigger refuses it

#### Scenario: Creating a work package without a project is refused

- **WHEN** `POST /api/work-packages` is sent without `projectId`, with `projectId: null`,
  with `projectId: 42`, with the id of another organization's project, and with an id no
  project has
- **THEN** the first two answer `422 project_required`, the third `422 invalid_body`, the
  last two `404 not_found` with identical bodies, and no work package is created

#### Scenario: Importing without a project is refused

- **WHEN** `{ document }` without `projectId` is posted to the import route, and mcp-01's
  import tool is called without `projectId` over the MCP transport
- **THEN** the route answers `422 project_required`, the tool answers an error naming
  `project_required`, and no work package is created

#### Scenario: Explicit legacy and internal producers validate their parent in the owner

- **GIVEN** explicit preactivation legacy admission and a real legacy organization with parent P
- **WHEN** direct creation or import supplies P on SQLite or memory
- **THEN** the actual owner validates P there before writing and the package belongs to P
- **AND** an omitted/empty parent writes nothing, while absent and foreign parents have the same not-found outcome
- **AND** no project is selected or created implicitly, even for an organization with no project
- **WHEN** activation changes before that legacy call is admitted
- **THEN** current admission refuses it without package/grant/audit effects

#### Scenario: The document does not choose the project

- **WHEN** a version15/16 document whose `project.id` is P2 is imported with `projectId: P1`
- **THEN** the new work package belongs to P1

#### Scenario: A failed creator grant leaves nothing

- **WHEN** the insert of the creator's `package-manager` grant fails during
  `POST /api/projects { name, workPackage }`
- **THEN** the request fails and no project, work package, grant or audit row exists

#### Scenario: The creator keeps a restricted package

- **WHEN** an `org-admin` creates project P with work package W through the combined create
  and then restricts W
- **THEN** that admin still writes W through the `package-manager` grant, and another
  `org-admin` cannot write W

#### Scenario: A new project with its first work package

- **WHEN** an admin sends `POST /api/projects { name: "WBS product", workPackage: { name:
"Editor" } }`, and again with the same name
- **THEN** the first answers `201` with project "WBS product" holding work package "Editor"
  whose `projectId` is the new project; the second answers `409 name_taken` and creates
  neither a project nor a work package

#### Scenario: The only project is deleted like any other

- **WHEN** an admin deletes the empty only project of an organization
- **THEN** it answers `204` and the organization holds no project

#### Scenario: Combined birth uses the current catalogue in the same owner

- **GIVEN** current organization bindings, including typed-only bindings, and no existing leaf rows
- **WHEN** a project and its first work package are created together
- **THEN** the same owner materializes every reached step's current defaults as explicit package values and returns those steps
- **AND** a separate committed read returns those same values; a legacy draft Step array supplies no catalogue authority, including when the current catalogue is empty
- **AND** queued creation captures bindings when its owner starts, later defaults do not rewrite earlier explicit values, and invalid or retired reached definitions roll back the whole project/package/grant/audit birth

### Requirement: An organization starts with no project

Organization activation (the activation CLI and the onboarding route) SHALL create no
project; nothing SHALL mark one project of an organization as special.

#### Scenario: A new organization holds no project

- **WHEN** a user creates an organization through onboarding, and an operator activates a
  legacy one through `organization-activation-cli.ts`
- **THEN** each organization holds no project, and a `POST /api/work-packages` there without
  `projectId` answers `422 project_required`

### Requirement: Slice 2 back-fills one migration project where work packages exist

The migration SHALL create one ordinary project named "Migrated work packages" in every
organization that holds work packages and none in an organization that holds none, and
point every work package of the organization at it. A back-filled project's `created_by`
SHALL be null (no actor); a project created through `POST /api/projects` SHALL carry its
creator. The same migration SHALL drop `work_package.owner_id` after copying it into a null
`work_package.created_by`, SHALL then make `work_package.created_by` NOT NULL, and SHALL
refuse on a database where `access_grant` does not exist. Where a list or space row showed
the owner's name it SHALL show the creator's (`createdByName`).

Current permissions SHALL NOT derive from package owner/creator metadata. Live
`SavedPlanPrincipals` and SQLite/memory projections SHALL omit `workPackageOwnerId`.
Explicit preactivation saved-plan rename/delete SHALL retain only the saved plan author's
nonnull `saved_plan.created_by_id` identity right (`createdById`), never package
`created_by`, display names or retired owner evidence. Scoped touch SHALL require current
readable-package admission and `package.write`, plus saved-plan authorship or effective
`package.manage_settings`, in the same writer; authorship SHALL NOT bypass current
membership/credential policy or `package.write`. Authorized touch SHALL remain header-only.
Legacy touch SHALL retain explicit actor/context before queueing. Its actual owner SHALL
reread the current activation marker and `saved_plan.created_by_id` before mutation, admitting
only current preactivation and that same nonnull author. A separate Resource principals read
or repeated request resolution SHALL NOT substitute for this check. Queued activation or
author changes SHALL refuse without effects. Existing `snapshot_busy` behavior and scoped
admission SHALL remain unchanged.

Ordinary edits of an existing current package under explicit preactivation legacy admission
SHALL retain existing authentication/write-scope requirements and SHALL admit only an
unrestricted package. A restricted package SHALL return the existing modeled forbidden
outcome for every actor, including its creator/former owner; package creator/owner and
historical document fields SHALL NOT grant ordinary legacy edit authority. Scoped paths
SHALL retain current membership, credential caps and actual package permissions including
P5. Admitted creation/import MAY create a restricted package; later ordinary legacy edits
SHALL still refuse. Reads/navigation and the separately specified saved-author legacy
header-maintenance rule SHALL remain unchanged. Expected legacy access SHALL NOT substitute
for the actual owner's current activation decision.

Full memory sources SHALL model explicit activation as real source-owned state staged with
their other state and read it inside the same creation/import/touch owner. A legacy
organization flag SHALL identify only the mapping destination, not preactivation authority.
Caller booleans, environment flags, legacy-organization presence and missing-state defaults
SHALL NOT supply current mode; missing modeled activation SHALL throw. Isolated old
`inMemoryStores` fixture admission SHALL NOT establish full-source current-mode parity.
This current ownerless rule supersedes the earlier saved-plans creator-or-owner rule/A-8
without rewriting its historical design or recorded Proof history.

Frozen owner-bearing document13/14 and input1–11 decoders SHALL retain strict validation,
original bytes/hashes and recorded Proof history. Retired owner SHALL remain historical
comparison evidence only. Current live fixture/authorization successors SHALL be explicit;
original migration/codec fixtures SHALL remain exact. Compatibility SHALL NOT introduce a
live owner/creator alias or permission inferred from a historical owner. These clarifications
SHALL NOT allocate an additional producer/wire version beyond the already planned bumps.

#### Scenario: Back-fill

- **WHEN** organizations A (3 work packages) and B (0) exist before the migration
- **THEN** A has one project "Migrated work packages" holding all 3 with `created_by IS
NULL`, B has no project, and renaming A's project, and deleting it once empty, is allowed
  like any other; a project an admin creates afterwards has `created_by` equal to that
  admin's account

#### Scenario: The owner column goes and its account is kept

- **WHEN** work package W has owner U and a null `created_by` before the migration
- **THEN** after it `work_package` has no `owner_id` column and W's `created_by` is U

#### Scenario: A preactivation saved plan belongs to its author for maintenance

- **GIVEN** a saved plan authored by U and a package created by another account V
- **WHEN** U renames or deletes it under explicit preactivation legacy admission
- **THEN** author-only header maintenance succeeds without decoding its stored body
- **WHEN** V or another nonauthor attempts that touch, or the saved plan has a null author
- **THEN** legacy touch is refused with no effects, regardless of package creator or retired owner

#### Scenario: Restricted legacy edits acquire no creator exception

- **GIVEN** explicit current preactivation legacy admission and a restricted current package
- **WHEN** its creator, former owner or another actor attempts an ordinary edit
- **THEN** the existing forbidden outcome refuses with no mutation or announcement
- **AND** an otherwise admitted unrestricted package remains writable

#### Scenario: Restricted creation and scoped edits remain separate

- **WHEN** an admitted scoped explicit-parent creation or import authors a restricted package
- **THEN** its actual content and creator grant settle under their existing atomic owner
- **AND** later ordinary legacy edits refuse, while actual scoped permission can admit the restricted edit
- **AND** matching creator metadata without the required scoped grant grants no right
- **AND** reads/navigation and saved-author legacy header maintenance retain their separate rules

#### Scenario: Queued legacy saved-plan touch rechecks current authority

- **GIVEN** an author-only legacy rename or delete has retained its explicit actor/context before queueing
- **WHEN** activation or the saved plan's author changes before the actual touch owner admits it
- **THEN** that owner rereads the current marker and saved-plan author and refuses with no effects
- **AND** no separate Resource preflight or repeated request resolution substitutes for those checks
- **AND** header-only maintenance, existing `snapshot_busy` handling and scoped policy remain unchanged

#### Scenario: Full memory legacy admission observes its real mode transition

- **GIVEN** a full memory source with explicit source-owned activation state staged with its other state
- **WHEN** that state changes from preactivation before a queued legacy creation, import or saved-plan touch is admitted
- **THEN** the same owner observes current mode and refuses the stale legacy act without effects
- **AND** a legacy organization flag, absent-state default or isolated fixture does not establish that control

#### Scenario: Scoped saved-plan maintenance retains current authorization

- **WHEN** an author without current `package.write` touches a saved plan
- **THEN** scoped admission refuses without effects
- **WHEN** a current readable-package writer is its saved-plan author or holds effective `package.manage_settings`
- **THEN** the same writer may maintain its header, including a null-author plan for the manager
- **AND** package creator metadata alone grants no touch authority and current membership/credential restrictions still apply

#### Scenario: The migration waits for the grant tables

- **WHEN** the slice 2 migration runs on a database without `access_grant`
- **THEN** it fails before rebuilding anything and `work_package.owner_id` is unchanged

### Requirement: The audit admits the project vocabulary through its own migration

Slice 2 SHALL widen `organization_audit` to admit subject kind `project` and the actions
`project_created`, `project_renamed`, `project_deleted` and `work_package_moved`, in a
migration of its own.

#### Scenario: The audit refuses project actions before the widening

- **WHEN** an `organization_audit` row with action `project_created` is inserted after
  slice 1's migration and before `widen_organization_audit_projects`
- **THEN** the subject-kind and action CHECK refuses it; after the widening it is admitted

### Requirement: A work package moves between projects of its organization

`POST /api/work-packages/:id/move { projectId }` SHALL require a nonempty explicit
destination. After actual current caller/context admission, it SHALL resolve organization-
scoped W and its package.read visibility, then the scoped destination. Missing/unreadable
W and absent/foreign destination SHALL answer identical `404 not_found` in that order,
before permission/content diagnostics. It SHALL then require BOTH current
`organization.create_project` and `package.write` on W from the unchanged resolved
principal/credential intersection; restricted W requires its actual reaching write grant.
No creator alias or future project permission SHALL replace either decision. W's actual
current parent and ownership mapping SHALL be established inside this same owner;
missing/malformed trusted state SHALL throw.

An authorized same-parent operation SHALL answer200 with no writes/audit. A real move
SHALL re-home W in one transaction, increment W and each distinct source/destination
project revision exactly once, validate safe revisions/overflow before mutation, and stamp
one retained instant. It SHALL append one `work_package_moved` row with subject kind
`project` and destination subjectId; flat detail SHALL be `workPackageId`, `fromProjectId`,
`toProjectId`, `workPackageRevision`, `sourceProjectRevision`, `targetProjectRevision`,
with actor/organization from current resolved access. Success SHALL be the explicit typed
reply `{ workPackageId, projectId, revision, sourceProject: { id, revision }, targetProject: { id, revision } }`,
using committed revisions (current unchanged values for the no-op). Unknown failure SHALL
roll back all constituents, preserving original/rollback failure pairs. Direct grants,
creation metadata, step/address identity and historical journal/saved/receipt bytes SHALL
remain unchanged. The direct store SHALL refuse `cross_organization` for a foreign target;
HTTP SHALL NOT expose that internal outcome after its scoped destination lookup. From
slice3a the move SHALL additionally refuse `409 type_not_allowed_in_project { typeIds }`;
future settings/type and step-code policies SHALL NOT be fabricated in this slice.

#### Scenario: Move refused by a type

- **WHEN** a work item of W carries type `spike` and the target project's allow-list is
  `{epic, story}`
- **THEN** the move answers `409 type_not_allowed_in_project { typeIds: [<spike id>] }` and
  W stays

#### Scenario: A foreign target is not found

- **WHEN** an admin of organization A moves W of A into a project of organization B, and
  again into a project id that does not exist
- **THEN** both answer `404 not_found` with identical bodies and W stays

#### Scenario: The store refuses across organizations

- **WHEN** the project store is asked directly to move W of A into a project of B
- **THEN** it refuses `cross_organization` and W stays

#### Scenario: Move applied

- **WHEN** a different target exists in W's organization, both current write permissions
  allow the move, and no incident dependency blocks it
- **THEN** W's `projectId` is the target, W's and each distinct project's revisions rose by
  one, and the typed reply carries those committed revisions with one destination-subject
  project-kind `work_package_moved` audit carrying the required flat detail

#### Scenario: Authorized same-parent move is a no-op

- **WHEN** W is readable, its current target is valid, and BOTH current write permissions
  allow moving W into its existing parent
- **THEN** the move answers200 with current package/source/target IDs and revisions, with
  no row, revision or audit change

#### Scenario: Lookup and permission precede content

- **WHEN** readable W lacks either current write permission
- **THEN** an absent/foreign destination answers the identical404 before permission; a
  valid destination answers403 before incident dependency facts, even when one blocks
- **AND** missing/hidden W does not inspect destination-side state

### Requirement: Move dependency refusal and deferred policies

Actual cross-work-package dependencies now exist. For a genuine parent change, this move slice SHALL check all current
incident typed relationships in BOTH directions under the same owner, projecting W to the
new parent and retaining counterpart packages' actual parents. It SHALL refuse
`409 dependency_crosses_project { dependencyIds }` when an incident relationship would
span different engagement projects. IDs SHALL be unique in deterministic UTF-8/BINARY
order without remote names/endpoints; authored held edges SHALL count, and counterpart
unreadability SHALL NOT silently drop a blocker after W visibility/permissions passed.
Local edges and counterparts already in the destination SHALL NOT block. Missing/malformed
counterpart parent/mapping state SHALL throw. This is the fulfilled conditional requirement,
not a new global dependency-creation prohibition; neither the historical branch nor a
fixture flag supplies move-boundary proof. This slice SHALL own its actual mounted tests.
Step-code matching/re-keying SHALL remain with `wbs-step-catalogue` (E21/E45); future
settings/type checks SHALL enter only with their actual persistence/resolution slice.

#### Scenario: Move refused by a dependency leaving the project

- **WHEN** incident dependency D links W to a counterpart left in its current project,
  whether W is the predecessor or successor, including an authored held relationship
- **THEN** the move answers `409 dependency_crosses_project { dependencyIds: [D] }` and
  package/project revisions, grants and audit remain unchanged

#### Scenario: Destination counterpart and local edges allow a move

- **WHEN** every external incident counterpart already belongs to the destination, and
  other edges are local to W
- **THEN** those edges do not block the otherwise authorized move and all original
  dependency endpoint IDs/records remain unchanged

### Requirement: Ordinary browser evidence has real current authority and owned run state

The current-organization ordinary Browser/Performance cohort SHALL use actual native
registration/login, the explicitly labeled issued-token cookie bridge, actual membership
and direct organization grants, verified selection/discovery and an API-created captured
parent. Helpers SHALL select that parent after navigation and supply explicit parent and
expected organization on writes, retaining normal protected dependency-client semantics.
No fake Project success, first/default parent, production auth bypass or automatic re-login
SHALL replace actual authority. Dedicated organization/dependency and local/refusal/layout
profiles SHALL remain explicitly separate; activated measure fixtures SHALL retain actual
organization discovery while altering only the intended measure surface.

The fixture SHALL retain real main optimizer launcher/runtime-version/spawner configuration
and `superviseBe` background/signal/disposal ownership, plus actual GW browser cookie,
origin and selected-organization authorization. Missing required runtime dependencies SHALL
visibly refuse the affected real cohort. Checkbox state alone SHALL NOT claim solver-result
proof. One exclusive fresh private store SHALL retain actual owner identity across its
controlled restart using the same complete MCP/browser/solver settings; an arbitrary
existing store/path SHALL NOT become resume authority. Readiness SHALL follow actual
bootstrap and run/store identity verification even though native registration needs the BE
listener earlier. Failed/unknown shutdown SHALL retain evidence; actual resources SHALL
close once before removal of only known owned nodes, preserving primary/cleanup failures.

Cookie state SHALL remain private. Exclusive metadata SHALL be published last only after
actual login/selection/discovery/Project readback, and bind this run/store, origin/endpoints
and exact state path. `--list` SHALL remain IO-free discovery of tests with respect to login,
state reads and server startup. Actual workers SHALL refuse missing, malformed, stale,
foreign-origin or mismatched-run state before fixture mutation. Manual contexts SHALL
explicitly carry state/baseURL; destructive auth cases SHALL use independently issued
credentials from empty jars before first authenticated navigation, without invalidating
shared bootstrap state. Known-unavailable legacy Project discovery SHALL be modeled by an
explicit owning state boundary, never warning suppression or fabricated scoped success.

Declared case/expect/service budgets, workers1/retries0, Performance120s and the existing
1200-cell bound with its unchanged row/step/measurement denominator SHALL remain unchanged.
Setup SHALL precede the measured DOM observation. Disposable fixture activation SHALL NOT
claim operational activation, installed composition readiness, full-suite or parent closure.

#### Scenario: Current selected browser uses a real explicit parent and gateway

- **WHEN** the cohort authenticates the actual registered account, selects its granted
  organization and reads back its API-created project
- **THEN** creation/import submits that captured parent and actual expected organization,
  and a real selected cookie socket receives a peer write through the real GW access check
- **AND** missing selection, foreign origin or revoked current state refuses without fake
  verification/access callbacks

#### Scenario: Discovery does not require worker state

- **WHEN** test discovery runs `--list` before cookie/setup state exists
- **THEN** it discovers tests without login, state reads or starting servers
- **WHEN** an actual worker has missing or mismatched run/origin/store/state publication
- **THEN** it refuses before its first fixture mutation instead of recreating authority

#### Scenario: Owned fresh bootstrap permits only its controlled restart

- **WHEN** the fixture restarts its own retained store after settled shutdown
- **THEN** actual native/current authority boots with identical complete MCP/browser/solver
  settings and verified identity, while an unrelated existing path cannot resume
- **WHEN** registration/bootstrap or actual cleanup fails or is unknown
- **THEN** primary and cleanup errors remain visible and uncertain owned nodes stay retained

#### Scenario: Destructive auth and manual contexts do not borrow implicit authority

- **WHEN** one independently issued empty-jar native session is logged out
- **THEN** the default credential remains usable, without automatic re-login
- **AND** manual contexts carry explicit valid state/baseURL with their original options,
  rather than relying on fixed local identity or omitted context configuration

#### Scenario: Legacy quiet loading and activated measure discovery retain their premises

- **WHEN** the explicit legacy quiet-load/refusal profile runs
- **THEN** it retains its actual feature-off premise and historical proofs, with no fake
  scoped Project success or warning suppression for unavailable-state discovery
- **WHEN** a measure-surface fixture runs in the activated current cohort
- **THEN** it preserves actual organization discovery and changes only the measure surface
- **AND** current-cohort quiet loading is observed separately under its real authority

### Requirement: Every setting resolves down the chain with provenance

Every catalogue entry SHALL declare its resolution (`nearest` or `additive`) and its
storage. A nearest key SHALL resolve from the read's own level upward, work package →
project → the project's space when it has one → organization → catalogue default, and
answer `{ value, provenance }`; an organization or space read SHALL resolve without any
project. A write at a level the catalogue does not allow SHALL be refused
`409 not_overridable_here`; `null` SHALL clear that level's value. `timezone`,
`calendarMarkers` and `allowedWorkItemTypes` SHALL be writable at space; `pertWeights` and
`budgetFactor` SHALL NOT. A stored value that fails its key's type, an unknown stored key
or a scope row naming a missing entity SHALL fail the read, never read as inherited. A
write at an organization, space or project, a project entering or leaving a space, and a
space deletion SHALL change the resolved values beneath at once and announce
`work_package_settings_changed` for each affected work package; any of them that would
leave a work item with a type outside its resolved `allowedWorkItemTypes` SHALL be refused
`409 types_in_use { count, workItems }`, listing every such work item (`id`, `name`, `typeId`,
`workPackageId`, `projectId`; the first 200, `count` the total) and change nothing; each such
write SHALL accept `dryRun: true` and answer the same list, or the work packages that would be
announced, under the write's permission without writing or announcing.

#### Scenario: Inherited, overridden, cleared

- **WHEN** project P sets timezone `Europe/Kyiv`, work package W of P sets none, then
  `Europe/Berlin`, then `null`
- **THEN** W's timezone reads Kyiv with provenance `{ project, P }`, then Berlin with
  `{ work_package, W }`, then Kyiv with `{ project, P }`

#### Scenario: A fixed setting is written at the project

- **WHEN** `PATCH /api/projects/P/settings { allowedWorkItemTypes: [<epic id>, <story id>],
budgetFactor: 1.5 }`
- **THEN** it answers `200`, and every work package W of P reads both values with
  provenance `{ project, P }`

#### Scenario: A fixed setting refuses the work package

- **WHEN** `PATCH /api/work-packages/W/settings { allowedWorkItemTypes: [...] }`
- **THEN** `409 not_overridable_here` and W's project allow-list is unchanged

#### Scenario: A space value resolves for its projects

- **WHEN** space S sets timezone `Europe/Kyiv`, project P sits in S and sets none, work
  package W of P sets none, and project Q sits in no space
- **THEN** W and P read `Europe/Kyiv` with provenance `{ space, S }`, and Q reads the
  organization's value or the catalogue default with that provenance

#### Scenario: A project-only setting refuses the space

- **WHEN** `PATCH /api/spaces/S/settings { pertWeights: { optimistic: 1, realistic: 3, pessimistic: 1 } }`
- **THEN** `409 not_overridable_here` and no space row is written

#### Scenario: An empty organization and an empty space resolve

- **WHEN** organization O holds no project and space S of O holds no project, O sets
  timezone `Europe/Kyiv`, and `GET /api/organization/settings` and
  `GET /api/spaces/S/settings` are read
- **THEN** both answer every catalogue key, timezone `Europe/Kyiv` with provenance
  `{ organization, O }` and the rest with provenance `default`

#### Scenario: A corrupt stored value fails the read

- **WHEN** a `setting_value` row for `timezone` at work package W holds a value that is not
  an IANA zone
- **THEN** `GET /api/work-packages/W/settings` fails naming the row and does not answer the
  inherited value

#### Scenario: A narrowing that existing work violates is refused

- **WHEN** work item I of W in project P carries type `spike` and
  `PATCH /api/projects/P/settings { allowedWorkItemTypes: [<epic id>] }` is sent, and again
  when P is added to a space whose list lacks `spike`
- **THEN** both answer `409 types_in_use { count: 1, workItems: [{ id: I, name, typeId: spike, workPackageId: W, projectId: P }] }`
  and nothing changes

#### Scenario: A dry run lists what would break without writing

- **WHEN** the same two writes are sent with `dryRun: true`, and then
  `PATCH /api/projects/P/settings { timezone: 'Europe/Kyiv', dryRun: true }`
- **THEN** the first two answer `200 { wouldRefuse: 'types_in_use', count: 1, workItems: [I…] }`,
  the third answers `200 { wouldRefuse: null, affectedWorkPackages: [W] }`, no setting, space
  membership or audit row changes, and no `work_package_settings_changed` is announced

#### Scenario: A space change applies at once

- **WHEN** project P sets no timezone, space S sets `Europe/Kyiv`, and P is added to S
- **THEN** every work package of P reads `Europe/Kyiv` with provenance `{ space, S }` on the
  next read, and each received `work_package_settings_changed`

### Requirement: The slice 3a migration lifts only real overrides

`work_package.timezone` and the PERT weight columns SHALL become work-package `setting_value`
rows only where they differ from the catalogue default. `work_package.budget_factor` SHALL
become one project-level row where every work package of the project holds the same value
other than the default 1, and no row where they all hold 1; where they disagree the
migration SHALL refuse naming the project. The columns SHALL then be dropped; every work
package SHALL read the same values as before.

#### Scenario: Lift

- **WHEN** W1 had `UTC` and 1/4/1 and W2 had `Europe/Kyiv` and 1/3/1
- **THEN** W1 has no rows and reads defaults with provenance `default`, W2 has two rows and
  reads its values with provenance `{ work_package, W2 }`

#### Scenario: Budget factor lifts to the project

- **WHEN** project P holds W1 and W2, both with budget factor 1.5, and project Q holds W3
  with 1.5 and W4 with 2
- **THEN** with only P present, P has one `budgetFactor` row of 1.5 and W1 and W2 read 1.5
  with provenance `{ project, P }`; with Q present, the migration refuses naming Q and
  nothing is lifted

### Requirement: Calendar markers add across levels

`calendarMarkers` SHALL be the catalogue's additive key, stored only in `calendar_marker`. A
work package's calendar SHALL be the union of its organization's, its project's space's
(when it has one), its project's and its own markers, each read with its own provenance. A
level's write SHALL add or remove only that level's own markers; `null` SHALL delete that
level's own markers; no write SHALL remove a marker of another level. Export SHALL carry
the union with provenance, and import SHALL write only the markers of provenance
`work_package`.

#### Scenario: Union across four levels

- **WHEN** organization O holds "New Year 2027-01-01", space S holds "Offsite 2026-11-20",
  project P in S holds "Holiday 2026-12-25" and W of P holds "Demo 2026-11-03"
- **THEN** `GET /api/work-packages/W/settings` answers the four markers with provenance
  `{ organization, O }`, `{ space, S }`, `{ project, P }` and `{ work_package, W }`

#### Scenario: Deleting a local marker keeps the inherited ones

- **WHEN** W deletes "Demo 2026-11-03", then tries to delete "Holiday 2026-12-25" through
  `DELETE /api/work-packages/W/calendar-markers/<holiday>`
- **THEN** W reads the three inherited markers, and the second request answers `404`

#### Scenario: Clearing a level's own set keeps the inherited ones

- **WHEN** `PATCH /api/projects/P/settings { calendarMarkers: null }` is sent
- **THEN** P's own markers are gone, and W reads O's, S's and its own markers

#### Scenario: Markers never enter setting_value

- **WHEN** a marker is written at any level
- **THEN** a row is written in `calendar_marker` and none in `setting_value`

### Requirement: Steps are project entities

A project SHALL define its step set (code, name, order) once; a work package SHALL hold
only its allowance and estimate unit per project step, keyed by the project's step id.
Creating, renaming or reordering a step SHALL be a project write seen by every work package
of the project. This requirement and the step lift below SHALL NOT be implemented before the
separate `wbs-step-catalogue` design lands, which may replace them (design E21, deferred
2026-10-25).

#### Scenario: A step added once is everywhere

- **WHEN** an admin adds step `review` to project P holding W1 and W2
- **THEN** both W1 and W2 list `review` with allowance 0

### Requirement: The step lift re-keys every step reference

The slice 3b migration SHALL lift steps into projects by code and re-key every row that
names a step: every table with a foreign key to `step` (twelve on `main` at `0b1dddaa0`,
listed in design E21) and `plan_event.step_id`. Stored journal payloads and saved-plan
bodies SHALL have their step ids rewritten once by the same migration, which SHALL refuse,
naming the row, on a payload shape it does not recognise. It SHALL refuse while any step
has no code or two codes of one project share a name.

#### Scenario: Lift and re-key

- **WHEN** project P holds W1 (created first) with steps `dev` (allowance 10) and
  `qa`, and W2 with `qa` and `ops`
- **THEN** P's steps are `dev`, `qa`, `ops` (deduplicated by code, first-occurrence order);
  W1 reads allowance 10 on `dev`, and every step node, estimate, attempt and claim of W1 and
  W2 reads the same as before

#### Scenario: Undo and history survive the step lift

- **WHEN** the last batch before the slice 3b migration edited an estimate on W2's `qa` step
  (merged into W1's `qa`), and the same account presses undo after it
- **THEN** replaying that pre-lift journal entry yields the same W2 tree as undo before the
  lift would have (the estimate restored on project step `qa`), W2's history lists the event
  against that step, and a saved plan of W2 stored before the lift compares equal to one
  saved after it

#### Scenario: An unrecognised journal payload refuses the lift

- **WHEN** journal row J holds a payload naming a step id in a shape the rewrite does not
  recognise
- **THEN** the migration fails on its guard naming J, and nothing is lifted or rewritten

#### Scenario: A code-less step refuses the lift

- **WHEN** work package W holds a step whose `code` is null
- **THEN** the migration fails on its guard naming W, and nothing is lifted

#### Scenario: Two codes with one name refuse the lift

- **WHEN** project P holds W1 with step `qa` named "Review" and W2 with step `rev` also named
  "Review"
- **THEN** the migration fails on its guard with `step_name_clash { projectId: P, name:
"Review", codes: ["qa", "rev"], workPackageIds: [W1, W2] }`, and nothing is lifted

### Requirement: Work item types stay directory-wide and a project allows a subset

Work item types SHALL stay named globally and unique across the directory. A project SHALL
hold `allowedWorkItemTypes`, resolved through `resolveSetting`, where an empty list allows
every type; assigning a type outside it on create or update SHALL be refused `409
type_not_allowed_in_project { typeIds }`. The slice 3a migration SHALL write no allow-list.

#### Scenario: Allow-list

- **WHEN** project P allows `{epic, story}` and a work item of W in P is given type `spike`
- **THEN** `409 type_not_allowed_in_project { typeIds: [<spike id>] }`; and in a project with
  no allow-list the same write succeeds

### Requirement: A project sits in one space or none

After slice 3a a project SHALL sit in at most one space (`spaceId`, null for an
organization-level project). The back-fill SHALL take, per (project, space) pair, the lowest
`position` among the project's work packages in that space; SHALL keep, per project, the
first pair by (that position, `space.created_at`, `space.id`); SHALL renumber each space's
kept projects by (that position, `project.created_at`, `project.id`); and SHALL write every
other pair once to `space_project_dropped` with its original position; adding a project that sits in another space SHALL be refused;
deleting a space SHALL return its projects to none; roll-ups SHALL answer one row per
project folded from its work packages' roll-ups with the work package rows beneath.

Before reducing a pair with MIN or sorting candidates, the back-fill SHALL validate every
participating raw ordering value. Membership positions and space creation timestamps SHALL
be finite numeric values, including fractions; project creation timestamps SHALL be stored
integers. These rules preserve the existing number-valued space metadata and integer-valued
project metadata contracts without adding a JavaScript safe-integer bound. An invalid value
SHALL refuse naming its field and entity, with schema, rows and migration ledger unchanged.

#### Scenario: A healthy duplicate does not conceal a malformed ordering value

- **GIVEN** two packages of one project in one space, with a valid position 5 on one pair
- **WHEN** the other position is BLOB, nonnumeric text or infinity, or a participating
  space/project creation timestamp is BLOB, or the project timestamp is fractional
- **THEN** back-fill refuses before MIN or ranking can normalize the bad input and the
  complete store remains unchanged
- **AND** finite fractional positions remain valid ordering inputs and retain their original
  values in discarded-pair reports; finite fractional space timestamps remain unchanged

#### Scenario: Back-fill keeps one space and reports the rest

- **WHEN** space S1 held W1 (project P1) at position 2 and W3 (P2) at position 1, and space
  S2 held W2 (P1) at position 1
- **THEN** P1 sits in S2, P2 sits in S1, and `space_project_dropped` holds exactly one row:
  P1 in S1 at position 2, kept in S2

#### Scenario: Several packages of one project in one space make one pair

- **WHEN** space S1 holds W1 and W4 of P1 at positions 5 and 3, and space S2 holds W2 of P1
  at position 4
- **THEN** P1 sits in S1, and `space_project_dropped` holds one row, P1 in S2 at position 4

#### Scenario: Equal positions fall back to the space's age and id

- **WHEN** P1's packages sit at position 1 in S1 and in S2, both spaces created at the same
  instant, and S1's id sorts first
- **THEN** P1 sits in S1 and the S2 pair is reported

#### Scenario: Tied projects in one space renumber deterministically

- **WHEN** P1 and P2 both keep S1 at candidate position 1 with equal `created_at`, and P1's
  id sorts first
- **THEN** P1's `space_position` is 10 and P2's is 20, on every run

#### Scenario: A project with no membership sits in no space

- **WHEN** no work package of P3 sits in any space
- **THEN** P3 reads `spaceId: null` and has no report row, and the guard finds kept projects
  plus reported rows equal to the distinct pairs

#### Scenario: A project in another space is refused

- **WHEN** P1 sits in S2 and `POST /api/spaces/S1/projects { projectId: P1 }` is sent
- **THEN** it answers `409 project_in_other_space { spaceId: S2 }` and P1 stays in S2

#### Scenario: An organization-level project

- **WHEN** project Q sits in no space, and later space S2 holding P1 is deleted
- **THEN** Q reads `spaceId: null` and is listed in `all` and in no space's roll-up, and P1
  reads `spaceId: null` with its work packages unchanged

#### Scenario: Folded roll-up

- **WHEN** P1's work packages start 2026-11-02 and 2026-11-09 and total 12 and 8 days
- **THEN** P1's row reads start 2026-11-02, total 20 days, with both work package rows beneath

#### Scenario: Project figures retain one committed read epoch

- **WHEN** a rival writer changes membership, child effort, dates or parent names after a
  project roll-up observation has selected its first database snapshot
- **THEN** all selected project shells, child inputs, cache selections and live row metadata
  retain that snapshot, and a later read observes the rival commit
- **AND** complete caller evidence and requested project IDs are retained before awaiting
  organization selection; local scheduling runs only after the read loan is released

#### Scenario: Empty and unavailable project figures remain explicit

- **WHEN** an admitted project has no readable child packages
- **THEN** its roll-up is `empty` with no invented schedule or effort
- **WHEN** one readable child requires an unavailable engine
- **THEN** the project roll-up is `unavailable`, never a partial total or a Fast fallback,
  while available child figures remain visible beneath it
- **WHEN** a child schedule fails but its effort is known
- **THEN** the project retains known effort, folded status and leaf counts and has no dates

#### Scenario: A roll-up query admits complete projects or refuses

- **WHEN** a query includes an unknown, foreign, out-of-space or invisible project ID, or
  any selected child requires an unreadable dependency endpoint
- **THEN** the entire query answers `not_found` with no partial projection
- **AND** package-only readers' totals and child rows include only their readable children;
  hidden packages change neither parent totals nor counts and disclose no private state

#### Scenario: Empty projects and package-only parents have distinct admission

- **GIVEN** an empty project E, project P with readable child W and unreadable child H,
  and project Q with no read permission or readable child
- **WHEN** a caller reads a named space or virtual `all`
- **THEN** E appears only with `project.read`, P appears with W and without H, and Q is omitted
- **AND** group identity contains only the actual project `id` and `name`; package-only
  visibility discloses no full project metadata, hidden-child count or placeholder
- **AND** project and package counts include only the admitted groups and children

#### Scenario: Grouped space replies and controls address actual projects

- **WHEN** `GET /api/spaces/:id` succeeds
- **THEN** it carries required `projects` groups with actual `project: { id, name }`,
  `position`, readable `workPackages` and a nonnegative integer `space.projectCount`;
  an obsolete flat `rows` member is refused
- **AND** the browser renders each project once, including empty projects, with child
  package links/figures beneath it; project arrange controls address its actual project id
- **AND** a viewer receives no arrange controls and the add picker excludes every displayed
  project, including one with no children, even if a later catalogue read has changed membership
- **AND** nested authenticated evidence is retained before initial organization resolution,
  and membership lost before the committed Source observation refuses current authority

#### Scenario: Grouped contents use one committed authority and membership observation

- **WHEN** grants, the space header or project membership change after the first SQL read
  while organization selection awaits
- **THEN** the in-flight grouped read uses its original committed authority, header,
  membership and project names, and the next observation sees the later commit
- **AND** a concurrent borrowed writer's staged changes remain invisible until it commits;
  rolled-back changes never appear through the public grouped reader
- **AND** virtual `all` includes permitted empty and organization-level projects, is read-only,
  and orders projects by binary name/id; named spaces preserve project position/id order
- **AND** child rows sort by binary name/id, and returned identities, children and settings
  cannot mutate a later observation

#### Scenario: Grouped read ownership and current credentials remain authoritative

- **WHEN** a Source closes with an already lent grouped observation
- **THEN** that observation may finish its captured snapshot, releasing its connection,
  while new grouped observations and released snapshot capabilities refuse use
- **AND** machine and consent readers use their own current credential grants; revocation
  refuses, and absent or unreadable trusted activation state throws
- **AND** explicit legacy access refuses after durable activation; before activation it keeps
  deployment-wide reads, with `organization_required` for named spaces without a legacy owner

### Requirement: Persons and teams belong to spaces without authority

`POST`/`DELETE /api/spaces/:id/people/:personId` and `/teams/:teamId` SHALL add and remove
belonging within the organization; the space read SHALL list them; no access, capacity or
schedule SHALL change.

The membership operations SHALL be bodyless and queryless and SHALL require the current
`organization.manage_spaces` grant on the actual admitted organization. An absent or
foreign space/member and a person/team identity of the wrong kind SHALL be concealed as
`404 not_found`; a virtual `all` mutation SHALL refuse `409 virtual_space`. Successful
adds/removals SHALL answer204. Adding an existing membership SHALL preserve its rows and
revision; removing a membership that does not exist SHALL answer404 unchanged. Persons
and service teams MAY belong to several named spaces.

Named space reads SHALL carry required `personIds` and `serviceTeamIds` arrays in binary
identity order. Their space header, project membership and both identity collections
SHALL come from one committed contents observation. Empty sets and virtual `all` SHALL
carry explicit empty arrays. Public Source reads SHALL not observe a borrowed writer's
uncommitted memberships; retained public and borrowed operations SHALL expire with their
actual owner. These memberships SHALL grant no access and SHALL advance no package
revision, scheduling input hash, event history or optimization work.

#### Scenario: Named-space people and teams are visible and manageable

- **GIVEN** a named space in the active organization
- **WHEN** its page reads the space and scoped people and teams directories
- **THEN** separate People and Teams sections show exactly its belonging under current
  directory names, including agent persons, and only a writable space offers add/remove
- **AND** adding and removing use the declared bodyless operations, retain the captured
  organization expectation and reread the space after the response
- **AND** a viewer can read belonging; virtual `all` offers neither section, and a legacy
  named-space context explains that an organization must be chosen
- **AND** loading, directory failure and concurrent directory deletion remain visible;
  a missing member label withholds that section's contents and offers refresh
- **AND** repeated submission admits one pending write; a retired editor or superseded
  directory observation cannot publish or withdraw its successor on a late response
- **AND** actual current organization access loss withdraws the containing space page

#### Scenario: Membership changes preserve scheduling and authority

- **GIVEN** an actual package and an owned person and service team
- **WHEN** each is added to a named space, added again and removed
- **THEN** the space lists exactly the matching identities, advances only for real changes,
  and its second add preserves the existing membership
- **AND** package schedule hashes, grants, rows and plan events remain unchanged

#### Scenario: Admission is current and native failure is atomic

- **WHEN** a space manager loses the actual grant while the request waits for its Source owner,
  or a native revision update fails after inserting a membership
- **THEN** the queued request refuses current authority, or the native failure rolls back
  both membership and revision; neither publishes plan events

Directory deletion through the current person/service-team writer SHALL remove that
identity's memberships from every named space in the same owner and SHALL advance each
affected surviving space revision once. Unrelated spaces and the other membership kind
SHALL remain unchanged. A refused or rolled-back deletion SHALL preserve the root,
memberships and space revisions. Space membership alone SHALL require no additional
cascade consent; existing assignment, label, person-membership and credential consent
rules remain authoritative. A failed native space revision update SHALL abort the entire
directory removal, including its foreign-key cascades.

#### Scenario: Directory removal and rollback preserve space coherence

- **GIVEN** a person and service team belonging to two spaces, and an unrelated space
- **WHEN** their actual directory owners remove either identity, or roll the removal back
- **THEN** committed removal clears only that identity's links and advances each affected
  space once; rollback leaves both root and memberships unchanged
- **AND** unconfirmed team usage refuses before removing memberships; confirmed removal
  retains the existing label, capacity and service-link cascade semantics

#### Scenario: Belonging changes nothing else

- **WHEN** person Ana is added to space S and removed again
- **THEN** S lists her and then does not, and every work package schedule input hash is
  unchanged throughout

### Requirement: The dev cleanup CLI reports before it deletes

`work-package-cleanup-cli.ts report` SHALL list doomed work packages by the selection rule
(owner's `users.username` in the named set or `^claire-reg-`, or name matching `^TASK-\d+\b`,
`^New project$`, `^resume check \d+$`) and the survivors; `apply` SHALL refuse unless
`--expect-count` equals the report's count and SHALL delete through the existing deletion path.

#### Scenario: A changed dataset refuses

- **WHEN** `report` counts 330, one more doomed work package is created, and `apply
--expect-count=330` runs
- **THEN** it exits non-zero naming 331 and deletes nothing

### Requirement: Frozen solver wire vocabulary is isolated at the internal boundary

Current host/domain/client models SHALL use work-package terminology. Solver boundary code SHALL explicitly project those models to frozen wire v5 keys and validate response scope/input/question identity before returning host outcomes. Both copies of wire schemas v1–v5 and Python solver 0.4.0 SHALL remain unchanged. Frozen internal protocol keys SHALL NOT leak into current public WBS or CLI shapes.

#### Scenario: A mixed connected request preserves frozen protocol ownership

- **WHEN** renamed host models with scope ownership, member work packages, fixed placements, occupancy and incoming/outgoing boundaries pass through the real solver request builder and unchanged Python CLI
- **THEN** every frozen wire owner is correct, the request is accepted and the returned host/public outcome uses work-package fields

#### Scenario: A substituted response identity is refused before projection

- **WHEN** a solver response changes its scope owner, input hash or question hash
- **THEN** production response validation refuses it before mapping or publishing a host result

### Requirement: Renamed canonical host inputs receive new scheduling identities

Current canonical host scheduler bytes SHALL use work-package fields, and scheduler contract SHALL advance from 18 to 19. Numerical scheduling and quantum semantics SHALL remain unchanged. Request contract/hash changes SHALL be distinguished from unchanged wire grammar. Old contract-18 cache entries SHALL miss before current-codec decoding, including when the plan input hash itself is unchanged.

#### Scenario: An old cache row cannot satisfy a current request

- **WHEN** a contract-18 row has the same input hash as a contract-19 request, or carries an old connected DTO
- **THEN** it is rejected before current DTO decoding and cannot serve or publish as the current result

#### Scenario: Renaming changes only permitted solver request identities

- **WHEN** corresponding pre/post-rename plans are scheduled through contract 19 with unchanged Python 0.4.0
- **THEN** corpus request differences are attributable to the renamed canonical host keys and resulting contract/input/question identities, and numerical scheduling and quantization outcomes remain equivalent

### Requirement: Changed saved schedule bodies receive unoccupied versions

Renamed plain schedule bodies SHALL use version3 and connected bodies version4. Published plain1 and connected2 bytes/hashes SHALL remain unchanged and validate with frozen historical readers before separate1→3 and2→4 projections. Only owned boundBy/elsewhereHolder and connected-evidence names SHALL change; numerical timing, calendar projection, ordering and algorithm identity SHALL remain unchanged. Mixed or unknown versions SHALL refuse, and connected2 SHALL NOT be interpreted as plain3.

#### Scenario: Actual engine timings survive schedule projection

- **GIVEN** actual engine-generated plain1 local/elsewhere bodies and a connected2 body with their original hashes
- **WHEN** they are read or compared against current plain3/connected4 captures
- **THEN** package field names and format versions change while timings, dates, attribution and original stored bytes/hashes stay unchanged

### Requirement: Changed connected host formats have explicit versions

Renamed connected host formats SHALL use stored-stage DTO 2, durable-success DTO 3, boundary-certificate DTO 2 and public connected-boundary version 2. Stored schedule cache DTO SHALL advance from4 to5 for renamed elsewhereHolder ownership; unchanged result-envelope and infeasible DTOs SHALL remain1. Local result, connected success and certificate caches SHALL independently refuse contract18 before decoding under an otherwise matching current19 key and generation, preserving old rows. Same-current-contract stale DTOs SHALL retain corrupt/throw semantics. Current plan exports SHALL rename nested `question.stageBytes` and `boundary.canonical` contents. Supported historical records SHALL validate their original bytes/hashes before read-time upgrades; historical stored bytes and hashes SHALL NOT be rewritten.

#### Scenario: Nested current export evidence uses renamed host fields

- **WHEN** a version-12 current plan export includes a connected stage and boundary evidence
- **THEN** the nested stage/canonical contents use work-package vocabulary and the connected format versions identify their changed shapes

#### Scenario: Historical integrity is checked before conversion

- **WHEN** a supported historical saved-plan or connected-evidence body/hash is corrupted and then read through an upgrade path
- **THEN** integrity validation fails before translation and no replacement stored bytes/hashes are written

### Requirement: Runtime identities survive the owner rename

Current runtime canonical envelopes, stored acceptances, receipts and states SHALL use version2 with workPackageId. Ledger marker1, incoming request/operation body1, unchanged claim/authority structures and rb1 basis bytes SHALL remain unchanged. Historical version1 scope uses projectId and SHALL be decoded strictly in its original format. Read ports SHALL retain raw versioned history; insertion ports SHALL accept current2 only.

#### Scenario: Replay returns the original accepted identity

- **GIVEN** a genuine outgoing authority, claim or write1 acceptance
- **WHEN** an authorized current caller retries the same semantic request or looks up its receipt
- **THEN** original canonical bytes, digest, accepted row, receipt and counters remain unchanged
- **AND** validation checks original format correspondence and hashes original bytes before comparison
- **AND** comparison encodes into the retained format and returns its original versioned receipt
- **AND** malformed/mixed/unknown formats or changed commands cannot bypass current admission or commit effects

#### Scenario: Resource runtime replay keeps ordered historical strings

- **GIVEN** an untagged published resource admission/event/declaration or an unlinked host job
- **WHEN** current input reaches replay, confirmation or cleanup under existing authority
- **THEN** the original identity string remains unchanged and comparison retains property order and absent fields
- **AND** new identity strings carry explicit envelope2 independently of runtime-command versions
- **AND** only owned owner keys project, with no new grant/planning lookup in infrastructure exceptions

### Requirement: Navigator preserves authored dependency identity across export generations

Navigator SHALL preserve7–14 compatibility and strictly read current ordinary15/connected16. Frozen13/14 SHALL retain owner-bearing validation through versioned public declarations, separate from the strict current15/16 declaration. Request decoders SHALL be constructed only on selection.

Complete published12 detached history SHALL validate in its original spelling before projection. Missing/malformed required history, mixed or undeclared fields and17+ SHALL refuse before output creation. Navigator input6 remains unsupported. These requirements supersede the slice1 consumer ceiling without rewriting its captured artifacts or Proof history.

#### Scenario: Complete connected history is required

- **WHEN** a12,14 or16 export omits required history, carries an invalid placement arm or boundary version, or mixes project/work-package fields
- **THEN** Navigator refuses before publishing tasks or a reference

#### Scenario: Every authored edge retains its identity

- **WHEN** Navigator reads12–16 with internal/external dependencies and parent successors
- **THEN** PlanTasks3 carries each authored typed dependency exactly once in document order with its type, scope, identity and display preserved; leaf tasks remain local and edges are neither expanded nor copied from detached history
- **AND** published12 projectId/projectName map explicitly to workPackageId/workPackageName after strict decoding

#### Scenario: Exact persisted version pairing

- **WHEN** supplied reference/tasks are checked even after recomputing their digests
- **THEN** only6/7→1,8–11→2,12–16→3 pairs are admitted; task schemas1/2/3 and reference schema1 retain their original meanings

#### Scenario: Bound receipts propose local commands only

- **WHEN** a schema2 receipt targets local leaf tasks in a12–16 reference
- **THEN** commands address only the selected work package; external-only IDs refuse and an ID shared with an external owner denotes only the local leaf
- **AND** changed external identity/display, captured parent identity/name or history-only replacement invalidates the older reference binding even when tasks remain equal; schema1 retains historical converter behavior and remains refused by admit-progress

#### Scenario: Current parent metadata cannot retarget commands

- **WHEN** Navigator reads a15 or16 export
- **THEN** complete ownerless work-package and parent metadata are required, and mismatched workPackage.projectId/project.id refuse before output
- **AND** the plan and command batch identify workPackage.id, never the engagement parent or an external owner; parent consistency grants no live authority
- **AND** frozen13/14 continue requiring their historical owner grammar without fabricated parent metadata

#### Scenario: Current versions reach the installed consumer chain

- **GIVEN** one packaged PUNI build containing the upgraded providers and versioned WBS contracts
- **WHEN** current15/16 and retained12/13/14 are processed by one installed artifact outside its source checkout
- **THEN** canonical PUNI Navigator, Burokrat and Dash commands and aliases preserve exact reference/task pairing, complete receipt2 binding and selected work-package destinations
- **AND** offline validation, installed asset/closure checks and source-fallback refusal remain; historical package/activation identities and schemas are not rewritten
- **AND** current help/docs name work-package routes; source-only checks do not establish installed delivery
