## Context

At base `53dfef620fa8f065dbddb9a2d9184c3469829475`, `RecoveryManifestSchema` stores version 1 `etcdMembers: string[]`. `planColdRestore` compares those strings with `ServerFence.nodeName`, then emits the unversioned `fencedServers` list. `restore.yml` uses that list both to exclude the target and to delete Node objects by name. `providerIdentity` is present in fences but is not compared with any snapshot machine identity. The reported live `h4claw-37a00c01` member / `h4claw` Node pair is architecture input, not a live observation made in this planning worktree.

`recover.test.ts` currently checks playbook task names/order, rather than executing those assertions. Its cold-restore fixtures use identical member and Node names. `ServerFence` also serves volume recovery: that contract has separate callers and must remain explicit.

## Goals / Non-Goals

**Goals:** make snapshot members, original Node objects, fenced machines and the actual replacement independently identifiable from recording through cleanup; prove actual execution guards can fail.

**Non-Goals:** implement the rehearsal environment, run a restore, change hosts, change application recovery, redesign volume recovery or infer mappings for old snapshots.

## Decisions

### Versioned boundaries

Introduce strict version 2 manifest, snapshot membership evidence, cold machine fence document and executable plan schemas. Plan decoding is required at the playbook boundary, not just the CLI. Keep volume fences on their existing distinct decoder/type and flags. Reject legacy cold inputs with instructions to capture supported evidence; do not manufacture v2 from equal-looking names.

The membership record contains `memberName`, `memberId` (nonzero canonical unsigned decimal string, at most uint64 max), `nodeName`, `nodeUid`, `machineId` and `providerIdentity`. Reject ambiguous mappings and duplicate members, Nodes and machines. Member IDs never pass through JavaScript numbers; collectors must obtain a lossless encoding at their source. The historical live example is a test fixture, never an inferred naming rule.

### Snapshot cut and publication

Use a dedicated certifying capture in the locked controller with a dependency-locked native client for the version of the etcd fork used by K3s. Bind the etcd mTLS peer and Kubernetes API credentials to the same enrolled cluster. Pin one leader endpoint for each attempt. The initial healthy status must identify its responder as leader and report a positive term and equal positive committed and applied Raft indexes. Between this observation and the snapshot cut, obtain the complete linearizable member list including learners and a most-recent Kubernetes Node list. Join each member to exactly one Node through its `etcd.k3s.cattle.io/node-name` annotation and check the Node UID, machine ID and independently observed provider binding. Use the native uint64 values to produce canonical decimal strings without numerical conversion.

Read status immediately after the first nonempty snapshot database chunk. The etcd fork pins a backend read transaction before streaming those bytes. Require the same connection, cluster, responder, leader, term, committed index and applied index. Even a membership change that returns to the original set advances the committed index. Discard mismatches and reconnects, with bounded retries when concurrent writes prevent a stable cut. Verify stream termination, database length and the etcd checksum trailer. Compute the digest and byte count of the complete stored bytes independently of the trailer. Scheduled compressed backups have no such witness and remain historical backups.

Use the cluster's protected versioned object store. Verify the upload by an immutable-version read and publish the sidecar last. The sidecar preserves both the original member list and complete mappings and binds them and the cut witnesses to the logical cluster, etcd cluster identity, bucket, object key, immutable version, SHA-256 and size. Its capture publication anchors the sidecar's own immutable version and digest under the protected capture authority. The recorder independently verifies the selected stored snapshot version and byte identity before comparing them with the capture sidecar and the downloaded file. It derives neither the authority nor the expected sidecar digest from request values. An incomplete capture publication produces no manifest.

The recorder loads its cluster-scoped HTTPS origin, bucket, publication prefix and explicit read principal from the controller-owned `/etc/puni/cold-restore-reader.json` and protected credential file. The controller supplies this configuration independently of the command environment and arguments. Use a guarded descriptor with root ownership, bounded regular-file inputs and no symlink following. The capture principal alone writes each publication once under the protected prefix at `<capture-id>/publication.json`. The recorder has read access. `--membership-evidence` selects an opaque capture ID. The publication supplies the sidecar key, exact non-null version and raw-byte SHA-256. `--object-key` and `--object-version` select the snapshot independently. Check the actual returned VersionId for both version-specific reads and compare exact snapshot key, version, digest and length to the authenticated sidecar. Compare the downloaded file against the same evidence.

See [K3s dependency pins](https://github.com/k3s-io/k3s/blob/v1.36.4%2Bk3s1/go.mod#L21-L26), [the frozen backend view](https://github.com/k3s-io/etcd/blob/v3.6.14-k3s1/server/storage/backend/backend.go#L325-L363), [snapshot and status RPCs](https://github.com/k3s-io/etcd/blob/v3.6.14-k3s1/server/etcdserver/api/v3rpc/maintenance.go#L123-L250) and [the K3s Node annotation](https://github.com/k3s-io/k3s/blob/v1.36.4%2Bk3s1/pkg/etcd/etcd.go#L1128-L1145).

Cold fences bind the evidence digest plus exact original mapping and nonempty provider/lab fence reference. A fence is an operator/provider authority assertion, not a Node readiness signal. Compare all identities, not the human readable Node name alone. Require exact coverage; reject extras and conflicting records.

### Execution target

The plan contains `schemaVersion: 2`, exact snapshot/evidence/manifest digests, original mappings/fences, and `replacement` with inventory host, intended Node name, machine ID and provider identity. The target is supplied before planning and is retained for review. It cannot reuse an original machine/provider identity or original Node name.

`restore.yml` decodes the full plan and compares inventory selection, actual `/etc/machine-id`, independently observed provider/lab identity and the existing k3s configuration before any mutation. The independently observed provider identity must come from the supported provider or lab adapter; passing the planned value back as an Ansible variable is not observation. Missing or unreadable identity fails. Keep the one-host, secret fingerprint, locked version, placed-byte and live-datastore confirmations; none overrides an identity mismatch.

For Hetzner, resolve the immutable server ID and assigned primary endpoint through the authenticated provider API. Connect directly to that endpoint with an independently enrolled allocation-specific host key, then observe the machine ID and k3s Node name on that peer. Recheck the provider binding before mutation and bind execution to that connection. A reconnect requires revalidation.

Start the rehearsal adapter with QEMU. Retain a freshly allocated VM UUID and host key in protected allocation state. Verify the running UUID, disk, seed and forwarded endpoint, then use the same fresh SSH peer proof. Other providers require a comparably independent adapter before admission. Provisioning the actual capture principal, provider account and host-key pins remains with the operator.

The locked controller must carry the decoder/helper used by the playbook. Execute the actual playbook in a disposable local guard harness with controlled file/command boundaries, capturing whether the first mutation was reached. Do not replace its assertions with a reimplementation in tests. A bounded VM proof belongs to the later rehearsal, not this change's claims.

### Node cleanup

Reuse the fleet's UID-precondition delete pattern where practical, with a recovery-specific entry through the real playbook. Read the original Node name, require its recorded UID, then send a Kubernetes DeleteOptions body containing `preconditions.uid`. Explicit NotFound is already absent. A name reuse before read refuses locally; name reuse after read conflicts at the API. Never delete by member name, name alone or `--ignore-not-found` masking unexpected errors. Observe confirmed deletion before reporting cleanup success.

## Risks / Trade-offs

Older snapshots without contemporaneous identity evidence cannot become executable v2 plans. Operators must keep them for investigation and obtain a separately reviewed recovery procedure rather than relabeling them. Strict target disjointness excludes reusing an original machine in this first supported contract. Identity proof does not establish application restoration, volume survival or object-storage availability.

The collector, controller packaging and independent provider observation are implementation dependencies. Record each `Proof:` comment once the production-path negative has failed under the injected fault.

## Migration Plan

Ship the recorder, planner and playbook together. Replace `--etcd-members` with a capture selector and add a replacement-target input for plan generation. Update fixtures, caller documentation and the controller package. Leave the volume commands' input shape unchanged and reject accidental cross-use. Update `docs/infra/recovery.md` and the operator table to mark existing-host restore blocked until the separately supported isolated rehearsal. Historical drill evidence retains its original scope.

## Recorder increment

Exercise the ordinary CLI against a loopback HTTPS fixture. A read-only Bubblewrap mount supplies a separate issuer-owned configuration directory at the fixed controller path, and a fixture CA authenticates the store. Clear the child environment and launch the same dispatcher with no recorder-specific test override. The publication and object-version responses come from the fixture server, independently of the command request. The initial cohort distinguishes member and Node names, preserves the maximum uint64 member ID, and refuses both a different returned immutable version with the same bytes and increased closing indexes with the same member set. This fixture establishes the recorder boundary. The capture helper and disposable real cut/change proof remain required for task 1.1.
