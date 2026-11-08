## ADDED Requirements

### Requirement: Enforced registry storage boundary

The registry SHALL use a verified capacity-enforcing filesystem with a configured
maximum of 50 GiB by default. The effective budget SHALL be the smaller of that
maximum and actual usable capacity. All registry blobs, manifests, metadata and
upload staging SHALL reside inside this boundary. A PVC request alone MUST NOT
qualify. Missing, wrong or unbounded storage MUST prevent writable startup.

#### Scenario: Storage fills without consuming the host root filesystem

- **WHEN** a disposable instance receives writes exceeding its enforced budget
- **THEN** further writes fail within that filesystem and the host root reserve remains available

#### Scenario: Registry mount is missing

- **WHEN** the configured filesystem is absent or replaced by the host root directory
- **THEN** writable startup fails before any registry content is created

### Requirement: Publication admission and pressure response

Publication and import SHALL serialize and reserve conservative byte and inode
envelopes before upload. Admission MUST refuse when usage plus reservations and
the new envelope reach 90% of effective bytes or inodes, when host root free space
is below 20 GiB, or when measurements are unknown. Pressure recovery SHALL require
usage below 70%, sufficient host reserve and verified maintenance.

#### Scenario: A large publication would cross the cutoff

- **WHEN** usage is 39 GiB of a 50 GiB budget and a publication reserves 7 GiB
- **THEN** admission refuses before uploading any layer and reports capacity required

#### Scenario: Two publishers compete for the remaining space

- **WHEN** two publishers request overlapping capacity simultaneously
- **THEN** at most one holds the publication slot and the other cannot spend its reservation

#### Scenario: Permission checking overlaps an authority update

- **WHEN** valid authority updates overlap the initial permission read, journal checksum and final permission read
- **THEN** the guard makes at most three complete attempts, each validating permission before and after hashing the journal
- **AND** a final permission sample that authorizes the observed checksum keeps admitted writes enabled without another attempt solely because the permission record changed
- **AND** the final sample passes ownership, file metadata, bounded byte-format, current-boot and post-checksum expiry checks
- **AND** only a changed valid final permission that does not authorize the checksum can restart the complete attempt; stable mismatch, invalid permission or three such unproved attempts selects read-only mode
- **AND** revoked, missing, unreadable, malformed, expired or wrong-boot permission and a failed checksum command refuse without falling back to the initial permission

#### Scenario: Pressure cannot be resolved safely

- **WHEN** all remaining images are protected and usage exceeds the stop threshold
- **THEN** new publication remains blocked, protected content remains retrievable outside maintenance, and an actionable alert is delivered

### Requirement: Protect images before referring to them

Publication, promotion, deployment, rollback and recovery SHALL durably protect
required digests before acting on references. Protection SHALL cover desired,
observed, rollback, recovery and unfinished work, including scaled-to-zero targets.
Release SHALL require owner completion or reconciled cancellation; timeout alone
MUST NOT release protection.

#### Scenario: An old release still serves an environment

- **WHEN** an image is older than ten newer successful releases but is desired by a scaled-to-zero environment
- **THEN** its complete image closure remains protected

#### Scenario: Deployment crashes before switching traffic

- **WHEN** a deployment has protected its candidate and rollback release but crashes before recording completion
- **THEN** both remain protected until recovery reconciles the operation

### Requirement: Complete trusted consumer inventory

Missing, unreadable, malformed or incomplete registered consumer inventory SHALL
prevent destructive maintenance before any manifest or blob is deleted.

#### Scenario: A consumer cannot be inspected

- **WHEN** a registered consumer inventory is missing, unreadable or malformed
- **THEN** retirement fails without deleting a manifest or blob

### Requirement: Release-aware retirement eligibility

Retirement SHALL retain the newest ten successfully promoted complete bundles per
product and all protected images regardless of age. Older successful bundles SHALL
be eligible only without protections. Unpromoted artifacts SHALL become eligible
seven days after trusted completion or abandonment receipts. Retirement SHALL
process eligible content oldest first; unknown ownership or history MUST block it.

#### Scenario: Partial publication never became a release

- **WHEN** two tiers uploaded before a third failed and the abandoned operation was reconciled more than seven days ago
- **THEN** those unprotected artifacts are eligible without being counted as a successful release

#### Scenario: Ten release bundles share tiers

- **WHEN** retained bundles share image digests with an eligible older bundle
- **THEN** retirement preserves every digest required by any retained bundle

### Requirement: Complete image dependency closure

Protection and retirement SHALL account for manifests, indexes, platform manifests,
configuration blobs and layers by digest, including untagged content and shared
references. Unsupported artifact relationships, corrupt content or incomplete
manifest enumeration MUST block destructive maintenance. Removing tags alone
MUST NOT count as reclaiming bytes.

#### Scenario: An untagged platform image belongs to a protected index

- **WHEN** an old untagged platform manifest is referenced by a protected multi-platform index
- **THEN** the platform manifest and every required blob survive retirement and an uncached pull succeeds

### Requirement: Serialized recoverable maintenance

Publication, import, backup, retirement and protection changes SHALL share one
operation authority. Retirement MUST revalidate storage and protection revisions,
verify a backup, exclude external writers and reference changes, delete only
eligible manifests and run offline GC. Retained content MUST be verified before
service restoration. Failure after deletion SHALL preserve a durable write fence
and recovery receipt.

#### Scenario: Protection changes after planning

- **WHEN** a new protection is recorded after a retirement plan was produced
- **THEN** applying that plan is refused and a fresh plan is required

#### Scenario: A process dies during garbage collection

- **WHEN** maintenance terminates after manifest deletion but before verification
- **THEN** restart and reconciliation preserve the write fence until recovery verifies the store

#### Scenario: Reclamation timestamps contradict durable chronology

- **WHEN** a persisted reclamation baseline is after the canonical update, its final measurement precedes the baseline, or its final measurement is after the canonical update
- **THEN** canonical read refuses the inconsistent receipt using chronological instants for every accepted ISO representation, and a fresh final age cannot redeem reversed lineage

#### Scenario: An unrelated restricted process exposes no mount rows

- **WHEN** a successfully read process mount table is empty because an unrelated process uses a restricted root
- **THEN** maintenance can continue only after proving that process has no hidden registry access through its filesystem root, current directory, directory descriptors or other live tasks
- **AND** regular descriptors and shared mappings still receive the complete writer audit

#### Scenario: A restricted process hides access to registry storage

- **WHEN** a process with an empty visible mount table can reach registry storage through its root, current directory, a directory descriptor, a proc magic link or another live task
- **THEN** the writer census refuses before destructive effects and the maintenance fence remains closed

### Requirement: Bounded backup lifecycle

Backups SHALL keep seven daily and four weekly recovery points, the last verified
snapshot and explicit recovery pins. They SHALL reserve worst-case new content and
prune workspace against a separately configured budget before writing. If required
coverage cannot fit, backup and destructive retirement MUST stop and alert without
deleting the last verified recovery point.

#### Scenario: Backup retention cannot satisfy its budget

- **WHEN** protected snapshots plus required workspace exhaust the configured backup budget
- **THEN** the last verified snapshot survives, no retirement begins, and the capacity failure is reported

#### Scenario: Backup recovery coverage is incomplete

- **WHEN** fewer than seven represented daily or four represented weekly recovery periods exist
- **THEN** retention reports the missing coverage, preserves every existing snapshot and offers no deletion candidates, while only separately budgeted backup creation may build coverage

#### Scenario: Backup storage paths change

- **WHEN** a registry has snapshots from both its previous and current storage paths
- **THEN** retention groups them by stable registry identity and preserves the last verified snapshot and explicit recovery pins by full snapshot ID regardless of path or age

### Requirement: Proven monitoring and adoption

Registry status SHALL expose measured capacity, reservations, protected and eligible
content, last maintenance and backup verification, and blocked reasons. A minute
pressure check and an external missed-check alert SHALL be verified through the
configured notification destination. Product adoption MUST remain incomplete until
the storage boundary, publication cutoff, protected retirement and recovery proofs
pass for the exact deployed revision.

#### Scenario: Monitoring stops

- **WHEN** the registry pressure check stops reporting for five minutes
- **THEN** the independent monitoring path delivers an alert and publication admission independently rejects stale measurements

#### Scenario: Healthy pressure observation leaves canonical history unchanged

- **WHEN** a successful pressure check measures changed capacity without requiring a canonical fence transition
- **THEN** the local report contains that invocation's actual observation while canonical bytes and revision remain unchanged and the ten-second write-permission renewal continues

#### Scenario: Local status cannot refresh an old observation

- **WHEN** status reads an old pressure report, a previous-boot report or a report that does not bind the current canonical snapshot
- **THEN** it exposes the observation as stale or unavailable, never refreshes its measurement time, and does not invent physical content or backup usage

#### Scenario: Maintenance holds the canonical command lock

- **WHEN** maintenance holds canonical authority while an operator requests status
- **THEN** status may read a fully validated atomic canonical snapshot without acquiring command authority or writing state, and reports missing or stale pressure observations explicitly

#### Scenario: Future observations use chronological ordering

- **WHEN** a report has a future measurement or emission, or its measurement occurs after emission, including canonical ISO timestamps with expanded years
- **THEN** the reader or status consumer rejects the invalid chronology and never exposes fresh pressure with a negative age

#### Scenario: Reservation totals remain separate from physical usage

- **WHEN** an operator requests status for empty or populated canonical reservations
- **THEN** status exposes their count and exact byte/inode totals separately from physical usage, while missing physical census remains explicitly unavailable

#### Scenario: Historical backup verification retains its origin

- **WHEN** status reports a verified backup from the current or a previous registry storage lineage
- **THEN** it exposes the receipt's original registry identity, storage identity, path and verification time alongside its age and lineage classification, and a failed backup does not refresh that receipt

### Requirement: Durable bounded alert delivery

Required incidents SHALL enter bounded durable state before replaceable reports or
retry can erase them. Sender attempts SHALL bind event, payload, destination and
persisted allowance. Missing established state and uncertain acknowledgements MUST
NOT become success or reset attempts.

#### Scenario: Healthy reports follow an undelivered cutoff

- **WHEN** a captured warning or cutoff remains unacknowledged while subsequent pressure returns to normal or the producer restarts
- **THEN** durable delivery preserves the incident's original evidence and identity until an exact acknowledgement or explicit resolution

#### Scenario: Pressure moves between thresholds without normal recovery

- **WHEN** an acknowledged warning is followed by cleanup pressure and then warning pressure without an intervening normal, unfenced observation
- **THEN** the same episode does not reissue its warning, distinct cleanup/cutoff occurrences remain capturable, and older unacknowledged incidents remain retained

#### Scenario: Sender recovers a failure missed before enqueue

- **WHEN** maintenance leaves a durable canonical failure and stops before capturing its alert, with no later maintenance invocation
- **THEN** the periodic sender recovers the original failure into the bounded outbox before deciding that delivery is idle, preserving operation and backup lineage without repeating maintenance effects

#### Scenario: Sender stops after possible submission

- **WHEN** a sender stops after its persisted request attempt but before durable acknowledgement
- **THEN** retry retains the event and destination binding, consumes its existing finite allowance and exposes uncertain delivery without claiming exactly once

#### Scenario: Notification response is not the selected protocol acknowledgement

- **WHEN** the destination rejects a request, redirects it or returns a response outside the explicitly selected acknowledgement contract
- **THEN** delivery remains unconfirmed, retry respects persisted limits and no stale success clears the outstanding event

#### Scenario: Established alert state disappears

- **WHEN** an enrolled alert store loses its current state, permanent lock or entire directory, or becomes unreadable or malformed
- **THEN** runtime refuses without recreating enrollment, clearing incidents or resetting the attempt budget

#### Scenario: Directory access recovers after uncertain alert finalization

- **WHEN** required replacement finalization fails after publication while the alert directory temporarily cannot create recovery files
- **THEN** restoring directory permissions alone does not resolve uncertainty: a fresh consumer refuses reuse until explicit recovery, preserving incidents and consumed attempt allowance

#### Scenario: Alert spool is full

- **WHEN** normal events fill their allowed slots or a critical event reaches the bounded store's limit
- **THEN** ordinary warnings cannot consume the reserved critical slot, existing critical incidents survive, and exhausted admission returns a visible bounded failure rather than success

#### Scenario: Retry would clear a maintenance failure

- **WHEN** backup or retirement failure is about to be cleared by retry
- **THEN** capture first preserves its operation identity, original verified-backup lineage and truthful capacity/protected-owner context, without inventing complete census evidence

#### Scenario: Alert storage profile is not established

- **WHEN** the selected store cannot prove its enrolled filesystem identity, physical bounds or reserved write/failure headroom
- **THEN** runtime refuses capture or sending rather than writing into an unbounded fallback filesystem

### Requirement: Backup budget measure

The registry backup budget SHALL be 100 GiB (107374182400 bytes), summing listed
stored sizes of backup objects, noncurrent versions and uploaded multipart parts.
Restic metadata files SHALL count by stored size. Provider metadata charges,
minimum billable sizes and billing rounding SHALL NOT count or require a billing
contract.

#### Scenario: File budget does not depend on billing overhead

- **WHEN** a complete repository file/part census and reserved additions fit the 100 GiB budget and the other admission requirements pass, but provider billing overhead is unknown
- **THEN** the budget check uses stored file sizes without requiring provider billing evidence or adding minimum billable sizes

#### Scenario: Logical backups fit but retained object versions do not

- **WHEN** noncurrent object versions make the sum of stored file sizes exceed the configured budget
- **THEN** backup admission refuses despite a smaller reported logical snapshot size

### Requirement: Backup budget reservations

Admission SHALL reserve additions before writes, including old/new file
coexistence during backup/prune. Existing stored sizes plus outstanding reserved
additions MUST fit the configured backup budget before storage-adding effects.

#### Scenario: New backup files exceed the remaining budget

- **WHEN** existing stored file sizes plus reserved additions and temporary coexistence exceed 107374182400 bytes
- **THEN** admission refuses before creating new backup files, even if existing files alone fit

### Requirement: Physical backup accounting

Admission SHALL use complete object/part listings and bounded prune workspace.
Snapshot grants SHALL bind bounded logical-byte and metadata observations of
both stopped roots to canonical operation/revision and source identity. Missing,
unreadable, changed or over-limit sources MUST refuse. Inspection grants MUST NOT
authorize snapshots.

#### Scenario: Sparse or metadata-heavy source exceeds its envelope

- **WHEN** source allocated bytes fit but logical bytes, directory entries or metadata exceed their independently configured observation limits
- **THEN** snapshot admission refuses before restic backup starts and preserves the prior verified receipt

#### Scenario: Source changes after snapshot admission

- **WHEN** source metadata or root identity changes between the stopped-source observation and the backup effect
- **THEN** the source binding refuses the new snapshot before launch, and an earlier repository inspection grant cannot substitute for snapshot admission

### Requirement: Durable backup effect consumption

Every backup command and exact-version recovery deletion SHALL consume a durable,
operation-bound ticket before launch. Repeated admission MUST NOT refill spent
allowance; uncertain effects MUST NOT replay. Effect state SHALL share enforced
journal storage outside captured contents and preserve canonical failure headroom.
Missing, unreadable, changed or unproven physical authorization MUST prevent
storage-adding effects.

#### Scenario: Worker dies after consumption

- **WHEN** a backup command or exact-version deletion was durably consumed but its terminal completion is unknown
- **THEN** retry refuses the spent ticket and retains its liabilities without refreshing allowance through admission

#### Scenario: Repeated preparation cannot mint another reservation

- **WHEN** one operation repeats preparation, catalogue inspection or snapshot admission
- **THEN** its existing phase binding and bounded slots are reused; configuration, profile or snapshot-source drift refuses before effects

#### Scenario: Effect state would spend canonical failure headroom

- **WHEN** a sidecar replacement fits its own record cap but would consume canonical journal replacement or failure headroom
- **THEN** the effect refuses before launch while canonical maintenance can still persist its bounded failure receipt

#### Scenario: Effect ledger disappears after enrollment

- **WHEN** established effect state, its permanent lock or its entire directory is absent during runtime or provisioning convergence
- **THEN** the operation refuses; only explicit fresh-backing enrollment may initialize vacant state, and convergence never resets consumption

#### Scenario: Canonical recovery rotates the token

- **WHEN** canonical recovery rotates the token and a strictly newer validated action attempt uses an existing funded operation reservation
- **THEN** that attempt may consume unused slots through its current lineage, while changed tokens on existing attempts and stale ports refuse without replacing source binding or refunding spent allowance

### Requirement: Early pressure response

The registry SHALL warn at 70% and request cleanup at 80% byte or inode use.
Actual use reaching 90% SHALL fence new writes. Nightly retirement SHALL remove
eligible content even below the cleanup threshold. Pressure-triggered retirement
SHALL target usage below 70% without weakening protections.

#### Scenario: Usage crosses the cleanup threshold

- **WHEN** byte usage reaches 80% while protected images occupy 75%
- **THEN** cleanup retires only eligible content, reports that the target is unreachable, and preserves every protected image

### Requirement: Per-environment rollback coverage

Each environment SHALL retain its current release and two previous successful
releases by default, independently of the product's newest-ten history. Incomplete
rollback or recovery obligations MUST retain additional required releases until
reconciled.

#### Scenario: An environment has not deployed the newest product releases

- **WHEN** its rollback release is older than the ten retained product releases
- **THEN** that rollback release remains protected until the environment advances its retained history or is safely retired

### Requirement: Independent journal capacity and durable fences

The authority journal SHALL use a separately bounded 1 GiB filesystem by default
and refuse new operations at 90% usage while reserving space for failure receipts.
Writable startup and reconciliation MUST respect durable pressure and recovery
fences. Missing or corrupt journal state MUST prevent writes and deletion.

#### Scenario: Registry storage fills during an upload

- **WHEN** registry writes fail for lack of space
- **THEN** the independent journal records the failure and subsequent restarts preserve the write fence

#### Scenario: Canonical receipt clock moves backwards

- **WHEN** a publication, pressure-fence or maintenance receipt clock is chronologically earlier than the last durable receipt, including across accepted expanded-year ISO representations
- **THEN** authority refuses before granting a reservation, entering maintenance work or changing the canonical fence receipt

#### Scenario: Canonical receipt clock advances across year formats

- **WHEN** a canonical receipt clock advances across the four-digit/expanded-year boundary or between accepted negative expanded years
- **THEN** authority recognizes the chronological advancement without misclassifying it as clock reversal

### Requirement: Mandatory installed selection and compatible artifacts

During coordinated managed rollout, every installed publishing, copy or consumer-mutating
entrypoint SHALL require the
complete trusted host catalog. Missing or unreadable catalog, source, artifact,
identity or protocol MUST refuse rather than imply unmanaged execution. An explicit
valid unmanaged catalog SHALL preserve legacy workflows.

#### Scenario: An adopted target loses its environment selector

- **WHEN** the selector is unset but the trusted host catalog enrolls the target
- **THEN** the entrypoint still requires managed protection and complete receipt binding before effects

### Requirement: Source-proved owning history and authenticated repair

Environment enrollment SHALL require initialized complete owning history from every
required history authority and actual-consumer coverage. History evidence SHALL bind
ordered bundles, exact references and original promoted receipts. Missing history
MUST NOT establish first-install. Read-only resume SHALL return successful evidence
only for an already-promoted matching existing operation and SHALL never mutate authority.

#### Scenario: Promotion succeeds but owner persistence is lost

- **WHEN** the authority is promoted and the owning source still has pending history
- **THEN** new ownership and retirement refuse while authenticated resume repairs the original receipt without deployment effects or authority mutation

#### Scenario: Durable evidence crosses accepted ISO year formats

- **WHEN** backup-attempt lineage, retirement/publication provenance or deployment-event history contains timestamps accepted by their respective schemas across ISO year representations
- **THEN** canonical validation rejects chronological contradictions and admits supported chronological advancement without changing stored timestamp representations

### Requirement: Registry-wide Docker coverage and environment ownership

All managed Docker containers, including stopped entries, SHALL remain covered by a
registered registry-scope census. Every Compose environment SHALL also have an actual
consumer projection linked to the same trusted machine, ownership catalog, executable
and transport. Unknown or ambiguous ownership MUST refuse complete inventory.

#### Scenario: One of two environments sharing an image retires

- **WHEN** A has no desired, active, stopped or unresolved references and B still uses the image
- **THEN** A may retire while B's global references and independent environment protection remain

### Requirement: Consumer completion precedes promotion

Kubernetes first-start and regular release SHALL protect before effects and preserve
recovery ancestry until verified reconciliation. Managed Compose SHALL verify the full
configured environment and shared smoke under its lock. Private Git pin/rollback SHALL
remain pending until exact downstream Flux, runtime and live checks succeed.

#### Scenario: Managed Compose smoke fails after all tiers commit

- **WHEN** shared smoke fails under the whole-environment lock
- **THEN** no promotion occurs, candidate/outgoing ownership remains, and retry verifies/smokes the complete candidate without repeating committed swaps or migrations

### Requirement: Dormant source staging preserves supported commands

Supported legacy publishing, copy, deployment and recovery commands SHALL retain
baseline routing and writer versions without discovering managed adapters. Direct
managed APIs SHALL require the complete trusted catalog and refuse absent, unreadable
or malformed state. Source staging MUST NOT establish enrollment or installed readiness.

#### Scenario: Legacy delivery without lifecycle installation

- **WHEN** a supported legacy command runs without registry lifecycle installation
- **THEN** it preserves its baseline effects and persisted schema without managed selection

#### Scenario: Direct managed call lacks trusted catalog

- **WHEN** a directly invoked managed API cannot read a complete trusted catalog
- **THEN** it refuses before publication or consumer mutation, without classifying absence as unmanaged

### Requirement: Source CI fixture prerequisites

Each CI job selecting ordinary fleet tests SHALL prepare compiler and unprivileged
user-namespace prerequisites before testing. Both infrastructure event filters SHALL
include changes to their shared preparation helper. Preparation failure MUST stop
before runtime tests without widening unrelated job selection or host permissions.

#### Scenario: Infrastructure helper changes alone

- **WHEN** a pull request or main push changes only the fixture prerequisite helper
- **THEN** infrastructure CI selects the owning fleet check and runs preparation first

#### Scenario: Prerequisite preparation fails

- **WHEN** compiler installation, executable-specific profile loading or namespace probing fails
- **THEN** each selecting job refuses before running fleet tests
