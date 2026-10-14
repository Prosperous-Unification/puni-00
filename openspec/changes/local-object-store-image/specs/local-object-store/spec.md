## ADDED Requirements

### Requirement: Authenticated local object store image

The local object store image SHALL package exact linux/amd64 MinIO and mc releases whose SHA-256 and minisign signatures are verified against the locked upstream public key before a build starts. Its shell base and BuildKit builder SHALL be pinned by digest, and the Buildx client SHALL match its exact locked version.

#### Scenario: Altered release artifact

- **WHEN** the downloaded binary checksum or detached signature fails verification
- **THEN** the build refuses before creating an image

#### Scenario: Missing verification tool

- **WHEN** minisign is absent or cannot run
- **THEN** the build fails visibly

### Requirement: Reproducible image identity

The image SHALL build without layer cache for linux/amd64 with normalized timestamps and explicit file modes. Its single OCI manifest digest SHALL equal the committed lock.

#### Scenario: Changed manifest

- **WHEN** a build produces another manifest digest
- **THEN** the builder refuses the archive

#### Scenario: Independent builds

- **WHEN** two builds use different input mtimes and umasks
- **THEN** they produce the same locked manifest digest

### Requirement: Disposable distribution and runtime contract

The backup rehearsal SHALL import the verified archive into its owned k3d cluster, run the shipped server and bucket Job as UID 1000, and observe their exact image identity. Production storage SHALL remain external.

#### Scenario: Digest registration

- **WHEN** the archive is imported into a disposable node
- **THEN** the distributor verifies the release tag's manifest in the node's `k8s.io` containerd namespace, registers the repository digest alias, and verifies that alias before applying consumers with pull policy Never

#### Scenario: Unavailable or different containerd target

- **WHEN** the source tag is absent, its target differs from the locked manifest, or the registered alias points to another manifest
- **THEN** distribution fails visibly

#### Scenario: Repeated import

- **WHEN** the same verified archive is imported again
- **THEN** source and digest alias still resolve to the locked manifest

#### Scenario: Platform and fleet startup

- **WHEN** either Flux-enabled k3d profile starts
- **THEN** the authenticated archive is built and its exact digest registered in every server and agent before Flux bootstrap

#### Scenario: Preload failure

- **WHEN** a required digest is absent or different, or image import fails
- **THEN** startup refuses before Flux bootstrap

#### Scenario: App startup

- **WHEN** the app-only k3d profile starts
- **THEN** object-store preparation is not required

#### Scenario: Bucket initialization

- **WHEN** the bucket Job succeeds
- **THEN** all four backup buckets have versioning and the 30-day noncurrent lifecycle rule, and two uploaded generations remain readable

#### Scenario: Failed bucket command

- **WHEN** an initializer command fails
- **THEN** the Job fails and the rehearsal refuses to proceed

#### Scenario: Scheduled backup verification

- **WHEN** the repaired PR #459 backup rehearsal runs
- **THEN** its real backend backup, restore, scheduled verification, and injected refusal drills pass
