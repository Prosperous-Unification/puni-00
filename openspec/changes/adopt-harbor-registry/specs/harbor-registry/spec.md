## ADDED Requirements

### Requirement: Private authenticated endpoint

The platform registry SHALL serve the OCI distribution API at `registry.puni.internal:8443` over
verified TLS, bound to the registry host's private address only. It MUST refuse anonymous
requests and MUST NOT allow self-registration.

#### Scenario: Trusted client

- **WHEN** a client with the registry CA and a valid robot credential requests a repository in
  that robot's project
- **THEN** TLS verifies and the request is authorised

#### Scenario: Anonymous request

- **WHEN** a client sends a request without a credential
- **THEN** the registry answers 401 and returns no repository content

#### Scenario: No public listener

- **WHEN** the endpoint is active
- **THEN** its host socket is bound to the configured private address and a connection to the
  same port on the host's public address is refused

### Requirement: Project storage quota

Every registry project SHALL have a finite storage quota. The registry MUST refuse a push that
would take a project over its quota.

#### Scenario: Push over quota

- **WHEN** a robot pushes an image whose new blobs would exceed the project's remaining quota
- **THEN** the push fails, the tag does not appear in the project, and the project's reported
  usage does not exceed its quota

#### Scenario: No unlimited project

- **WHEN** the declared configuration is checked against the registry
- **THEN** a project whose quota is unlimited is reported as drift

### Requirement: Robots cannot delete

Robot accounts SHALL be scoped to one project and MUST NOT hold any permission that deletes an
artifact, a tag or a repository.

#### Scenario: Push robot deletes

- **WHEN** a push robot sends a delete request for a manifest or a tag in its own project
- **THEN** the registry refuses it and the artifact remains pullable by digest

#### Scenario: Pull robot pushes

- **WHEN** a pull robot pushes an image to its own project
- **THEN** the registry refuses it

#### Scenario: Robot crosses projects

- **WHEN** a robot of one project pulls from another private project
- **THEN** the registry refuses it

### Requirement: Retention keeps promoted and recent images

Retention SHALL run per project on a schedule. Within each repository it MUST keep every artifact
that carries a promotion tag, the ten most recently pushed artifacts and every artifact pushed
within the last seven days. It MUST remove every other tagged artifact and every untagged
artifact that no kept image depends on.

#### Scenario: Promoted tag survives

- **WHEN** an artifact carries `promoted-<environment>`, was pushed more than seven days ago and
  is not among the ten most recently pushed in its repository
- **THEN** a retention run keeps it and it remains pullable by digest

#### Scenario: Old unpromoted image is removed

- **WHEN** an artifact has no promotion tag, was pushed more than seven days ago and is not among
  the ten most recently pushed in its repository
- **THEN** a retention run removes it

#### Scenario: Recent image beyond the newest ten

- **WHEN** an artifact has no promotion tag, was pushed within the last seven days and is not
  among the ten most recently pushed in its repository
- **THEN** a retention run keeps it

#### Scenario: Rollback keeps both images

- **WHEN** release tooling rolls an environment back by swapping `promoted-<environment>` and
  `promoted-<environment>-previous`
- **THEN** both images carry a promotion tag and a retention run keeps both

#### Scenario: Multi-architecture image

- **WHEN** a kept tag names an image index and retention and garbage collection have run
- **THEN** every platform manifest of that index is still pullable by digest

### Requirement: Held images are immutable

A tag matching `hold-*` SHALL be immutable: the registry MUST refuse to delete it or to push
another image under it, and retention MUST keep its artifact.

#### Scenario: Overwrite a hold tag

- **WHEN** a push robot pushes a different image under an existing `hold-*` tag
- **THEN** the registry refuses it and the tag still names the original digest

#### Scenario: Retention meets a hold tag

- **WHEN** an artifact older than seven days and outside the newest ten carries a `hold-*` tag
- **THEN** a retention run keeps it

### Requirement: Garbage collection reclaims space online

Garbage collection SHALL run on a schedule without stopping pushes or pulls. It MUST free the
storage of removed artifacts and MUST NOT remove content that a concurrent push uploaded.

#### Scenario: Collection during a push

- **WHEN** garbage collection runs while a robot pushes an image
- **THEN** the push succeeds, the pushed image is pullable by digest afterwards, and the image
  filesystem's used bytes fall by the size of previously removed content

#### Scenario: Dry run

- **WHEN** garbage collection runs as a dry run
- **THEN** it reports what it would free and the image filesystem's used bytes do not change

### Requirement: Bounded data filesystems

Registry, database, job-log and cache data SHALL each live on a dedicated filesystem of fixed
size. Each data-holding workload MUST verify at start that its data path is that filesystem and
MUST NOT start otherwise. The sum of project quotas MUST NOT exceed 70% of the image
filesystem's usable capacity.

#### Scenario: Missing mount

- **WHEN** a data filesystem is not mounted and its workload starts
- **THEN** the workload does not reach Running and nothing is written under the mount point on
  the host root filesystem

#### Scenario: Wrong filesystem

- **WHEN** a different or larger filesystem is mounted at a data path and its workload starts
- **THEN** the start-up check fails and the workload does not reach Running

#### Scenario: Full image filesystem

- **WHEN** the image filesystem has no free space
- **THEN** pushes fail, pulls of existing images succeed, and garbage collection can still run

#### Scenario: Quotas over the bound

- **WHEN** the declared project quotas sum to more than 70% of the recorded usable capacity
- **THEN** the declared configuration is rejected before anything is applied

### Requirement: Bounded memory

Every container of the registry installation SHALL declare a memory request equal to its memory
limit. Vulnerability scanning MUST stay disabled.

#### Scenario: Rendered workloads

- **WHEN** the platform check renders the registry installation
- **THEN** a container without a memory limit, a container whose request differs from its limit,
  or an enabled scanner fails the check

### Requirement: Declared configuration

Projects, quotas, retention rules, immutability rules, robots, schedules, webhooks and system
settings SHALL be declared in one file in Git. A check MUST report every difference between that
file and the registry, and MUST NOT print a secret.

#### Scenario: Drift is detected

- **WHEN** a retention rule, a quota or a robot's permissions are changed in the registry by hand
- **THEN** the check exits non-zero and names the changed item

#### Scenario: Undeclared project

- **WHEN** the registry holds a project the file does not declare
- **THEN** the check reports it and applying the file does not delete it

#### Scenario: Robot nears expiry

- **WHEN** a declared robot expires within 21 days or its stored secret no longer logs in
- **THEN** the check exits non-zero and names the robot

#### Scenario: Unreadable input

- **WHEN** the declared file, the admin credential or a robot secret file is missing, unreadable
  or malformed
- **THEN** the command fails before it sends any change to the registry

### Requirement: Backup and restore proof

A scheduled backup SHALL capture the registry database and the image store while the registry is
read-only, and MUST return the registry to its prior write mode whether it succeeds or fails. A
restore drill MUST pass before the first consumer uses the registry.

#### Scenario: Restore drill

- **WHEN** a backup is restored into an isolated registry on another node
- **THEN** a known image is pullable from it by its original digest and every referenced blob
  matches its digest

#### Scenario: Corrupt backup

- **WHEN** a restored blob or the stored snapshot is altered
- **THEN** verification fails before success is reported

#### Scenario: Failed backup

- **WHEN** the dump, the transfer or the verification fails
- **THEN** the command exits non-zero, the previous success receipt is unchanged, no snapshot is
  pruned and the registry accepts pushes again

### Requirement: Single registry after cut-over

After the registry is recorded ready, the Distribution endpoint on port 5000 SHALL stop serving.
Its stored data and backups MUST be kept.

#### Scenario: Old endpoint withdrawn

- **WHEN** cut-over is complete
- **THEN** a connection to `registry.puni.internal:5000` is refused, the proof image is pullable
  from port 8443 by its original digest, and the Distribution volume and snapshots still exist
