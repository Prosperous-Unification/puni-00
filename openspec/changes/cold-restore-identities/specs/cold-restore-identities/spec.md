## ADDED Requirements

### Requirement: Snapshot membership evidence names distinct identities

Version 2 recovery manifests MUST bind a nonempty, complete set of etcd member identities to Kubernetes Node identities and machine identities for the exact snapshot and cluster. Member IDs MUST be canonical nonzero unsigned 64-bit decimal strings. Recording and verification MUST reject missing, unreadable, malformed, duplicate, conflicting or incomplete evidence, unknown fields and unsupported versions.

#### Scenario: Capture witnesses one authenticated cut

- **WHEN** a capture supplies evidence for a version 2 recovery manifest
- **THEN** Snapshot membership evidence MUST originate from a leader-bound capture that witnesses the same authenticated peer, cluster, leader, term and equal committed and applied indexes before the identity reads and after the first nonempty database chunk.

#### Scenario: Protected publication binds the exact versions

- **WHEN** the capture authority publishes the snapshot membership evidence
- **THEN** The capture publication MUST bind the independently verified immutable snapshot and sidecar versions and raw-byte digests under the protected capture authority.

#### Scenario: Recorder reads the controller-owned authority

- **WHEN** the recorder resolves evidence for a version 2 recovery manifest
- **THEN** The recorder MUST obtain the expected sidecar and independently selected snapshot identity through its controller-owned version-aware reader.

#### Scenario: Member and Node names differ

- **WHEN** snapshot evidence maps member `h4claw-37a00c01` with member ID `18446744073709551615` to Node `h4claw` with its UID and exact machine/provider identities
- **THEN** recording and verification preserve every identity and accept the mapping without numerical conversion of the member ID

#### Scenario: Evidence does not identify this snapshot

- **WHEN** evidence names another cluster, snapshot digest, size or immutable object identity, omits a snapshot member, or comes only from a later live inventory
- **THEN** recording refuses and emits no manifest

#### Scenario: Identical bytes exist in two immutable versions

- **WHEN** a version-specific read returns the same snapshot key and bytes under a different immutable version than the authenticated sidecar binds
- **THEN** recording refuses and emits no manifest

#### Scenario: Membership looks unchanged after the cut

- **WHEN** the opening and closing statuses cover the same identities and membership, but the closing committed and applied Raft indexes have advanced
- **THEN** recording refuses and emits no manifest

#### Scenario: Evidence cannot be trusted

- **WHEN** evidence is absent, unreadable, malformed, version 1, contains unknown fields, repeats a member ID/name or maps distinct members to one Node or machine
- **THEN** recording or verification fails explicitly without inferred identities or automatic conversion

### Requirement: Every original machine has an exact fence

Cold restore MUST require one nonempty powered-off or deleted machine fence for every original machine in snapshot membership evidence. Each fence MUST match its member, Node and machine/provider identities and the snapshot evidence it authorizes. A different machine with the same Node name MUST NOT satisfy this check. Duplicate, unrelated or contradictory cold-restore fence records MUST be rejected.

#### Scenario: All originals are fenced

- **WHEN** every snapshot member has exactly matching machine fence evidence
- **THEN** verification produces a plan retaining the original member, Node and machine identities separately

#### Scenario: Fence names a replacement machine

- **WHEN** a fence repeats the original Node name but has a different machine ID or provider identity, an empty evidence reference, a running state, or an omitted original
- **THEN** verification refuses before planning reset or Node deletion

### Requirement: The plan and actual replacement host agree

Version 2 executable plans MUST bind the snapshot evidence, original identities, machine fences and an explicit replacement target consisting of inventory host, intended Node name and machine/provider identities. The replacement target MUST be disjoint from every original machine identity and original Node name.

#### Scenario: The playbook validates the observed replacement before mutation

- **WHEN** the actual Ansible playbook receives a cold-restore plan
- **THEN** The actual Ansible playbook MUST validate plan shape/version, one-host scope, target identity and actual k3s node-name before stopping k3s, moving the datastore or resetting etcd. A variable containing a replacement name MUST NOT substitute for observed host identity.

#### Scenario: Restore preflight retains the existing protections

- **WHEN** an operator attempts a version 2 cold restore through the playbook
- **THEN** Existing token, SOPS, snapshot, cluster, lock-version and running-datastore confirmation protections MUST remain effective.

#### Scenario: Original host is relabelled as the replacement

- **WHEN** the playbook runs on an original machine using a replacement inventory alias or Node-name variable
- **THEN** its actual machine identity comparison refuses before any datastore effect

#### Scenario: Target differs from the reviewed plan

- **WHEN** inventory host, machine ID, provider identity or actual configured Node name differs from the plan, or two hosts are targeted
- **THEN** actual Ansible execution refuses before stopping k3s

#### Scenario: Old executable plan is supplied directly

- **WHEN** an unversioned, version 1, malformed or unknown-field plan is passed directly to `restore.yml`
- **THEN** the playbook refuses before host mutation even when the CLI is bypassed

### Requirement: Cleanup deletes only original Node identities

After the replacement is Ready, cleanup MUST resolve only the original Kubernetes Node names/UIDs from the validated plan, re-read each Node and submit deletion with an API UID precondition. Missing Nodes MUST be a controlled already-absent outcome; malformed responses, unexpected read failures and a different UID MUST fail. The replacement Node MUST never be a cleanup target. A conflict or deletion failure MUST stop cleanup and be reported.

#### Scenario: Names have different domains

- **WHEN** the plan maps etcd member `h4claw-37a00c01` to original Node `h4claw`
- **THEN** cleanup addresses `h4claw` with its original UID and never uses the member name as a Node name

#### Scenario: Node name is reused during cleanup

- **WHEN** the old Node is replaced by a new UID before the read or between the read and delete
- **THEN** cleanup refuses or the API rejects its UID precondition, and the replacement object remains

#### Scenario: Cleanup cannot confirm identity

- **WHEN** a Node read returns permission failure or malformed identity instead of an explicit NotFound
- **THEN** cleanup fails without treating the Node as already absent

### Requirement: Cold restore does not redefine volume fencing

Cold-restore machine fence evidence MUST have a distinct boundary from the existing volume-fence input contract. Volume rebind and attachment removal MUST retain their current node, volume, claim, UID and Retain checks; neither command MUST silently accept cold-restore evidence as its legacy input.

#### Scenario: Cold evidence is passed to a volume command

- **WHEN** a version 2 cold-restore fence document is supplied to `rebind-volume` or `remove-attachment`
- **THEN** it is rejected explicitly while the existing valid volume-fence fixtures retain their behavior

### Requirement: Existing-host recovery remains blocked pending rehearsal

Operator guidance MUST label existing-host cold restore blocked until a separate supported isolated rehearsal demonstrates the selected path. The identity change MUST NOT reinterpret historical k3d/QEMU evidence as proof of the new contract or authorize production host mutation.

#### Scenario: Identity implementation passes its focused checks

- **WHEN** identity and playbook guard checks pass without a supported isolated restore rehearsal
- **THEN** verification records their limited claims and the existing-host restore runbook remains blocked
