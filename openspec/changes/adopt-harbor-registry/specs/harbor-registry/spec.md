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

#### Scenario: Pod reaches a registry port

- **WHEN** a pod outside the registry installation, or a host other than the registry's node,
  connects to a registry pod address on its API port or on an internal port of its cache,
  database, inner registry, core or job service
- **THEN** no connection is established

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

### Requirement: Robot credentials are supplied and renewed

A robot's secret SHALL be the one the operator supplied, and a secret the registry generates MUST
NOT be printed, logged or stored. A robot MUST expire no later than 90 days after its creation.
A rotation MUST replace a role's robot with one that has a fresh 90 days, and the role MUST be
able to authenticate throughout. A rotation MUST NOT accept a secret file older than the role's
live robot.

#### Scenario: First creation

- **WHEN** a declared robot is created
- **THEN** the operator-supplied secret logs in, and no secret appears in the command's output
  or logs

#### Scenario: Rotation renews expiry

- **WHEN** a role is rotated 60 days after its robot's creation
- **THEN** the role's new robot logs in with the new secret and expires 90 days after the
  rotation

#### Scenario: Rotation leaves no gap

- **WHEN** the new robot of a role exists and its consumer has not yet received the new secret
- **THEN** the old robot still logs in, and it is refused only after it is retired

#### Scenario: Stale secret file

- **WHEN** a role is rotated and the idle name's secret file is older than the live robot's
  creation
- **THEN** the rotation is refused and no robot is created

#### Scenario: Retirement removes the secret file

- **WHEN** a role's old robot is retired
- **THEN** its secret file no longer exists on the host

#### Scenario: Pull robot retired before its consumer moved

- **WHEN** a pull role's old robot is retired while the pull secret of a declared namespace does
  not name the new robot
- **THEN** the retirement is refused and the old robot still logs in

#### Scenario: Unfinished rotation

- **WHEN** a role has had two live robots for more than seven days
- **THEN** the check exits non-zero and names the role

#### Scenario: Malformed secret

- **WHEN** a supplied secret is shorter than 8 or longer than 128 characters, or lacks an
  upper-case letter, a lower-case letter or a digit
- **THEN** the command fails before it sends any request to the registry

### Requirement: Retention keeps promoted and recent images

Retention SHALL run per project on a schedule. Within each repository it MUST keep every artifact
that carries a promotion tag, the ten most recently pushed tagged artifacts and every artifact,
tagged or not, pushed within the last seven days. It MUST remove every other tagged artifact.

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

- **WHEN** release tooling rolls an environment back through the swap tag and retention runs
  between any two of its steps
- **THEN** both images carry a promotion tag at every step and retention keeps both

#### Scenario: Untagged artifact inside seven days

- **WHEN** an artifact has no tag, because its index has not arrived yet or because its build tag
  was pushed again, and the artifact itself was pushed within the last seven days
- **THEN** retention and garbage collection both leave it pullable by digest

#### Scenario: Untagged artifact after seven days

- **WHEN** an artifact has no tag and was pushed more than seven days ago
- **THEN** a retention run removes it, whenever it lost its tag

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
storage of removed artifacts, MUST NOT remove content that a concurrent push uploaded and MUST
NOT delete an artifact itself.

#### Scenario: Collection during a push

- **WHEN** garbage collection runs while a robot pushes an image
- **THEN** the push succeeds, the pushed image is pullable by digest afterwards, and the image
  filesystem's used bytes fall by the size of previously removed content

#### Scenario: Dry run

- **WHEN** garbage collection runs as a dry run
- **THEN** it reports what it would free and the image filesystem's used bytes do not change

#### Scenario: Untagged artifact at collection

- **WHEN** garbage collection runs while an untagged artifact exists
- **THEN** the artifact still exists afterwards

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

#### Scenario: Abandoned upload

- **WHEN** a client starts a blob upload and never finishes it
- **THEN** its bytes are gone from the image filesystem within five hours

#### Scenario: Quotas over the bound

- **WHEN** the declared project quotas sum to more than 70% of the recorded usable capacity
- **THEN** the declared configuration is rejected before anything is applied

### Requirement: Guaranteed resources

Every container of the registry installation, init containers included, SHALL declare a CPU
request equal to its CPU limit and a memory request equal to its memory limit, so that every pod
is in the Guaranteed QoS class. A rollout MUST NOT run two pods of one workload at once.
Vulnerability scanning MUST stay disabled.

#### Scenario: Rendered workloads

- **WHEN** the platform check renders the registry installation
- **THEN** a container or init container without a CPU or memory limit, one whose request differs
  from its limit, a workload with a rolling update strategy, or an enabled scanner fails the
  check

#### Scenario: Running pods

- **WHEN** the installation is running
- **THEN** every one of its pods reports the Guaranteed QoS class

#### Scenario: Saturated node

- **WHEN** other work saturates the node's CPUs while images are pushed and collected
- **THEN** no container of the installation is restarted

### Requirement: Declared configuration

Projects, quotas, retention rules, immutability rules, robots, schedules, webhooks and system
settings SHALL be declared in one file in Git. A check MUST report every difference between that
file and the registry, and MUST NOT print a secret.

#### Scenario: Drift is detected

- **WHEN** a retention rule, a quota or a robot's permissions are changed in the registry by hand
- **THEN** the check exits non-zero and names the changed item

#### Scenario: Registry left read-only

- **WHEN** the registry is read-only outside a backup run
- **THEN** the check exits non-zero and names the setting

#### Scenario: Check during a backup

- **WHEN** the check starts while a backup run is in progress
- **THEN** it exits as deferred, reports no drift and sends no notification

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

#### Scenario: Killed backup

- **WHEN** the backup process is killed or times out while the registry is read-only
- **THEN** the registry accepts pushes again without an operator, and no success receipt is
  written

#### Scenario: Host restart during a backup

- **WHEN** the host restarts while a backup's run marker is on disk
- **THEN** the registry accepts pushes again once it is up, without waiting for the next backup

#### Scenario: Registry already read-only

- **WHEN** a backup starts and finds the registry read-only without a run marker of its own
- **THEN** it refuses to run, and the registry is still read-only after the unit has stopped

### Requirement: Operational alerts

Filesystem fill, quota events and failed registry maintenance units SHALL each produce a
notification at the configured destination. A measurement that cannot be taken MUST produce a
notification and MUST NOT count as healthy.

#### Scenario: Fill threshold crossed

- **WHEN** a data filesystem crosses one of its fill thresholds
- **THEN** one notification names the filesystem and the threshold, and no further notification
  follows until the next crossing

#### Scenario: Quota event

- **WHEN** a project reaches its quota warning level or a push is refused for quota
- **THEN** a notification reaches the destination

#### Scenario: Maintenance unit fails

- **WHEN** the backup, the daily check or the fill check fails
- **THEN** a notification names the failed unit

#### Scenario: Unreadable mount

- **WHEN** the fill check cannot read a data filesystem
- **THEN** it fails and a notification says so

### Requirement: Single registry after cut-over

After the registry is recorded ready, the Distribution endpoint on port 5000 SHALL stop serving.
Its stored data and backups MUST be kept.

#### Scenario: Old endpoint withdrawn

- **WHEN** cut-over is complete
- **THEN** a connection to `registry.puni.internal:5000` is refused, the proof image is pullable
  from port 8443 by its original digest, no client holds a credential for port 5000, and the
  Distribution volume and snapshots still exist
