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

### Requirement: Bounded backup lifecycle

Backups SHALL keep seven daily and four weekly recovery points, the last verified
snapshot and explicit recovery pins. They SHALL reserve worst-case new content and
prune workspace against a separately configured budget before writing. If required
coverage cannot fit, backup and destructive retirement MUST stop and alert without
deleting the last verified recovery point.

#### Scenario: Backup retention cannot satisfy its budget

- **WHEN** protected snapshots plus required workspace exhaust the configured backup budget
- **THEN** the last verified snapshot survives, no retirement begins, and the capacity failure is reported

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

### Requirement: Physical backup accounting

Backup admission SHALL count repository objects, applicable noncurrent versions
and unfinished multipart uploads. Missing accounting or prune workspace bounds
MUST prevent admission. Logical snapshot size alone MUST NOT establish available
backup capacity.

#### Scenario: Logical backups fit but retained object versions do not

- **WHEN** noncurrent versions make physical usage exceed the configured budget
- **THEN** backup admission refuses despite a smaller reported logical snapshot size

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

### Requirement: Mandatory installed selection and compatible artifacts

Every installed publishing, copy or consumer-mutating entrypoint SHALL require the
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
