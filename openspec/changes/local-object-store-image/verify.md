## Verification

Committed transcripts remove terminal color/control sequences and trailing whitespace; original command logs remain in the owned /tmp evidence paths.

Base: reviewed PR #459 head `56041540718015fa579c920b2afe6d42c1d729bc`. Its initial-apply CronJob suspension is preserved.

## Authenticated inputs and tools

Exact GitHub release binaries matched the committed SHA-256 values. Ubuntu apt-authenticated minisign 0.11 (package SHA-256 `854c5f9dddaa99a02915f8cacd41e03442cb6cda25f7bbc53c0a3d297bcd064f`) plus libsodium23 (`74d6f8fbd65f7f71b6f4f4223bef5fb57c1c14cd4e9ce788ead2b88e8c3ee236`) verified both binary and trusted-comment signatures. Both commands printed `Signature and comment signature verified`; corrupted actual signature bytes produced `Signature verification failed`. See [authenticity output](evidence/upstream-authenticity.txt).

The key was inspected at lines 29–31 of the immutable upstream Dockerfile.release URL in the source lock. Official Docker Buildx v0.38.0 binary SHA-256 `4fe4cc38adf48169132749b6ca22a990928db0118e3407584ee553723115d287` matched both GitHub asset metadata and publisher checksums.txt. That checksum file's own SHA-256 was `667bc6f6965af9b5e93956dbad71522077570d7b9fa856cdd9241ab7d2483fe2`, matching release metadata. The verified plugin was installed only under owned `/tmp/puni-minio-docker/cli-plugins`; actual client output was `github.com/docker/buildx v0.38.0 0dbe87f36ed472fe36b6796c3f70b4210a731fc5`.

Locked k3d v5.9.0 and kubectl v1.36.4 binaries were SHA-256 checked before use. BusyBox's exact pinned index digest was resolved and compared before either build; the locked BuildKit builder was inspected through the existing fleet controller guard.

## Image and runtime proof

Disposable local Docker/k3d work used the shared local mutex `/tmp/wbs-heavy-work.lock` through `source bin/heavy-lock-lib.sh; with_heavy_lock /tmp/wbs-heavy-work.lock -- <owned command>`. This uses the exported lock seam on the workstation; it is not a canonical h2 gate. The Linux production resolver remains unchanged.

Two no-cache builds varied input mtimes (2000/2030), modes (0644/0600), and umasks (022/077). Both emitted `sha256:6892027e04ff9f75ad83dcff7f459b8cdfa043ac573a9d88a616bd7803890670`. Both builds used production `buildObjectStore` and verified actual signatures. The first discovery deliberately supplied an unset expected digest and observed its manifest refusal before reading the archive; no unset digest entered committed runtime state.

Direct k3d archive import initially produced ErrImageNeverPull: containerd held the correct release-tag target but lacked its repository digest alias. Explicit registration restored resolution. Production `importObjectStore` now inspects the exact source and alias manifest in each node's `k8s.io` namespace; actual missing-source refusal and two repeated import passes are recorded in [distribution output](evidence/reimport-runtime.log).

The shipped server and bucket Job Pod imageIDs equal `docker.io/puni-local/object-store@sha256:6892027e04ff9f75ad83dcff7f459b8cdfa043ac573a9d88a616bd7803890670` ([Pod status](evidence/pod-identities.json)). Server and mc executed as UID 1000. All four buckets (`puni-velero`, `puni-es-snapshots`, `puni-sqlite`, `puni-etcd`) had versioning and the 30-day noncurrent lifecycle rule; both uploaded generation bytes were read by their separate version IDs ([generation output](evidence/bucket-generations.log)). An actual mc version-enable command against a missing bucket failed the Job with its specific cause; no acceptance sentinel ran ([failed Pod](evidence/bucket-fault-pod.json)). [Full image/runtime output](evidence/local-image-runtime.log) preserves these observations.

## Repaired backup rehearsal

`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-deploy:test:backup` passed in 3m9s ([full output](evidence/backup-lab.log)). It used source `56041540718015fa579c920b2afe6d42c1d729bc` and real backend manifest `sha256:8d516af08bd1cafd6a5d37cefa7de410ce13be402b0d0c80c7936edf00b01bab`. Both backup and verification pod admission probes rejected the old Bun image and admitted the backend image. The actual backup created versioned snapshot `sqlite/wbs/20261014T112254142Z.db` with 69 migrations; restore recovered the known API-written row and identical bytes, passing integrity, foreign-key and migration-set checks. The shipped verification CronJob succeeded for that snapshot and failed the absent-prefix, appended-byte snapshot and changed-migration-report drills with their specific required causes. Ordinary lab cleanup removed its owned cluster and registry.

General platform/fleet startup now prepares object storage before Flux bootstrap; the app-only profile skips it. Source/digest/import caller faults propagated before bootstrap, and removing that prerequisite made those negatives fail ([caller red](evidence/k3d-caller-red.log), [guard removal](evidence/k3d-caller-guard-removed.log), [green](evidence/k3d-caller-green.log)). Registration covers the platform server and worker server plus both agents.

## Failure proofs

Each guard below was removed from the production path, its negative test was watched fail, then the guard was restored. Adjacent `Proof:` comments name the observed fault.

| Check                         | Injected fault                                                         | Observed evidence                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Binary checksum/signature     | Altered checksum; signer rejects                                       | [builder guard removals](evidence/builder-guards-removed.txt), [actual crypto refusal](evidence/upstream-authenticity.txt)          |
| Source lock                   | Incomplete trusted state; duplicate image identity                     | [builder guard removals](evidence/builder-guards-removed.txt), [identity guard removal](evidence/identity-source-guard-removed.txt) |
| Buildx client                 | Wrong client version                                                   | [red](evidence/buildx-red.log), [guard removal](evidence/buildx-guard-removed.log)                                                  |
| Download/build/index/manifest | HTTP 503, Docker exit 42, tar exit 2, empty index, wrong manifest      | [builder guard removals](evidence/builder-guards-removed.txt)                                                                       |
| Digest distribution           | Import exit 42, absent source, wrong source target, wrong alias target | [red](evidence/import-red.log), [guard removals](evidence/import-guards-removed.log), [green](evidence/import-green.log)            |
| Bucket shell/lifecycle        | mc command exit 42; empty ILM export                                   | [bucket guard removals](evidence/bucket-guards-removed.txt), [green](evidence/bucket-green.txt)                                     |

Absent/unreadable locks and absent actual signer executables are covered by production-path tests. The two runtime identity authorities cannot disagree: only toolchain.json defines the output identity; object-store.json rejects output identity keys.

## External refusals and limitations

An initial h2 lease reached the build and failed because Docker had no buildx plugin ([missing tool](evidence/h2-missing-buildx.log)); the verified owned plugin repaired that tool boundary. A subsequent canonical h2 lease waited 1800 seconds and exited 75 behind holder pid 1814770 ([timeout](evidence/h2-queue-timeout.log)); it did not run an image build. No h2 lock was bypassed.

The first local backup-lab attempt refused before cluster creation because available memory was 3180 MiB below its unchanged 3.5 GiB boundary ([refusal](evidence/backup-memory-refusal.log)). A fresh retry observed 7928 MiB and proceeded. Real platform startup refused at 14264 MiB available versus 16384 MiB required ([platform refusal](evidence/platform-resource-refusal.log)); its normal teardown confirmed no cluster. Fleet startup independently refused at 12105 MiB versus 24576 MiB ([fleet refusal](evidence/fleet-resource-refusal.log)); Docker ownership-label queries confirmed no containers or networks. These resource boundaries were not bypassed, so a successful general platform/fleet startup remains unverified. Local runtime proof does not certify hcloud Retain-volume behavior or a production provider store. No public image publication is claimed.

## Scoped checks and OpenSpec verification

- Final `tool-fleet:test`: 458 passed, 0 failed, 1659 expectations, 40 files. After the test-only lint repair, focused image/import/bucket/caller checks passed 26/0.
- Final `tool-deploy:test`: 335 passed, 0 failed, 982 expectations, 22 files.
- Scoped fleet/deploy lint and typecheck passed. Deployment build passed after replacing the owned clone’s shared node_modules symlink with a frozen Bun install (1292 packages): the previous shared dependency state lacked locked @noble/hashes2.4.0, so shared-test-evidence build had refused before the deployment target. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx format:check --all` passed. Initial lint refusals were repaired test typing/async assertion issues; no failing run certifies the final code.
- `bunx @fission-ai/openspec@1.12.0 validate local-object-store-image --json`: valid, no issues. The bare openspec executable was absent; the same explicit Bun package pin as CI was used.

Using the openspec-verify-change skill, all three requirements and all 13 scenarios map to the production builder/distributor, both lab callers, focused negatives and real backup/image evidence. Design follows the existing fleet deterministic BuildKit pattern and sole toolchain output identity. No requirement or scenario was skipped. Implementation tasks 1–6 are complete; task 7 retains independent review and exact canonical h2 gate. General platform/fleet successful startup is a documented runtime limitation because their resource guards refused, rather than an omitted prerequisite.

The sandbox suite encountered loopback EPERM in existing fixtures and was rerun with sockets permitted; that refused run did not certify the suite. Full h2 gate and final independent review remain outstanding before archive/integration.
