# Registry activation verification

## Status

Runtime implementation `6e37b3fc7f642cc14cb907f8484ffa3cba6519bd` is deployed and independently approved. Operational setup and recovery proofs passed. The final exact-SHA canonical gate is pending; task 4.1 and final handoff remain open and block completion/archive. No public PR exists: automatic approval review rejected publication of infrastructure/recovery documentation; explicit user approval is pending. The earlier candidate branch was already pushed, while the final fix was transferred privately to the gate host.

| Dimension    | Evidence                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Completeness | Host integration, scoped activation, scheduled backup and off-node recovery implemented; final gate/handoff pending                              |
| Correctness  | All four delta requirements and their scenarios have implementation and live/fault evidence below                                                |
| Coherence    | Public source pin and product images preserved; private fleet owns encrypted identity; single-instance maintenance and custody limits documented |

Delta spec sync: `private-registry-activation` needs sync before archival. This change remains active; no archival was requested.

## Implementation and checks

Base: `6a9a50abfbb0693de99394b4c72e0b0e185f69f0`. Runtime commits: host roles `10ad80a88`, host review fixes `a14f9ff93`, backup runner `812c5a06d`, operation/design documentation `ff2965781`, final concurrency/proof fix `6e37b3fc7`. Both task reviews approved; final review found the Flux suspension race and weak source-identity negative, then independently approved the scoped fix. No material finding remains open.

Commands and observed results:

- `REGISTRY_TEST_ANSIBLE=/tmp/puni-registry-ansible/bin/ansible-playbook REGISTRY_TEST_KUBECTL=/tmp/puni-registry-ansible/bin/kubectl bunx nx run tool-fleet:test:registry-hosts`: 6 passed, 147 assertions, 117.53 seconds. Final timeout fixture repeat: 1 passed, 13 assertions. Exact pinned Ansible/kubectl, real OpenSSL and systemd unit verification were used. Local service-manager actions were substituted; live rollout below covers that boundary.
- `PUNI_TEST_RESTIC_BINARY=/tmp/puni-restic-0.19.1 bun test --timeout 30000 --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/backup-registry.test.ts`: final implementation 36 passed, 192 assertions, 20.99 seconds. Final scoped proof repeat: 14 passed, 68 assertions. Real restic executable checksum matched the production lock. Its two external-binary cases visibly skip in ordinary runs without this variable; this explicit run executed them.
- Changed-file ESLint, backup TypeScript build and Ansible fixture TypeScript check: exit 0. Normal commit hooks passed; no hook bypass. The tool-wiki hook reported inactive external activation; migration/doc-cap hooks skipped nonmatching files.
- `NX_DAEMON=false bunx nx run tool-fleet:check` at `ff2965781`: all test/lint/typecheck dependencies and every infrastructure family passed in 1m4s. Subsequent changes are the separately tested backup acknowledgement/proof fix.
- `openspec validate --all --json`: 265 changes and 18 specs valid, zero failures. Existing non-blocking warnings in unrelated active changes are not resolved by this task. The activation change’s strict validation had no issues.
- Private fleet tests, lint, typecheck, rendering and policy passed. Two pre-existing release receipt formatting failures were corrected mechanically. Private PR 12 merged as `4d95e8ef0be3e27a7ee67b33d732cb0472a491c4`; both fleet-check CI and the separate k3d website rehearsal passed.
- Canonical gate for earlier candidate `ff29657814b2fa2d0e9fe889eed2d11d38dddb06`: running under the h2 heavy lock; the exact printed SHA was confirmed. Its result cannot establish the final fix.
- Final canonical gate: `bin/h2puni-gate.sh 6e37b3fc7f642cc14cb907f8484ffa3cba6519bd`, invoked in the isolated h2 gate tree after private bundle fetch, with no checkout outside the lock. Pending. Actual `nx format:check --all` and `nx run-many -t test lint typecheck build` completion output will be recorded after exit.

Implementation signal: runtime changes are committed; only verification/runbook bookkeeping remains to commit. Record clean-tree output after that commit.

## Failure proofs

Tests invoke the production roles or executable runner with real filesystem/process consumers, rather than searching source strings. Mutation experiments use isolated copies and do not alter deployed code.

| Safety boundary                     | Injected fault and observing test                                                                | Observed proof                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Private endpoint address/port       | Public/invalid IPv4 and malformed port, `registry-hosts.test.ts` preflight cases                 | Refused before writes; removed validation permitted the previously rejected configuration                                          |
| Required proxy executable           | Missing proxy fixture                                                                            | Refused; removing its assertion allowed unit writes                                                                                |
| Existing unit ownership/readability | Unmanaged and unreadable unit fixtures                                                           | Refused before writes; ownership assertion removal allowed replacement; fresh absence installed successfully                       |
| Effective systemd drop-ins          | Vendor, prefix and competing public-listener overrides                                           | Refused across effective search roots; removed guard permitted unit writes                                                         |
| Client input validation             | Invalid hostname, owner/mode/service fixtures                                                    | Refused before trust/config writes; removed validation allowed writes                                                              |
| CA trust                            | Invalid PEM fixture                                                                              | OpenSSL refused; removed check installed invalid trust                                                                             |
| Credentials                         | Empty password fixture                                                                           | Refused with redacted logs; removed assertion installed it                                                                         |
| Existing node configuration         | Unmanaged/unreadable registries.yaml; absence tested separately                                  | Refused before mutation; removed ownership check replaced conflicting configuration                                                |
| Bounded server readiness            | Real kubectl against stalled response; stuck executable                                          | Request 5s and process 15s limits bounded failure; removing each deadline produced the expected regression failure                 |
| Backup executable and secret files  | Mutated executable, env mode0644, absent/unreadable password                                     | Preflight failed; cluster state and prior receipt preserved                                                                        |
| Backup repository                   | Failing existing-repository consumer                                                             | No cluster mutation; no implicit repository initialization                                                                         |
| Flux source identity                | Otherwise valid wrong name/kind/path for root and child                                          | Each preflight negative failed safely; removing each comparison made its two negatives fail                                        |
| Prior reconcile annotation          | Numeric root/child request token                                                                 | Refused before mutation; bypassing validation made both negatives fail                                                             |
| PVC/PV identity and locality        | Broken claim/node/path consumer responses                                                        | No suspension or scaling; source bound to PV and local machine ID                                                                  |
| Reconciliation quiescence           | Delayed old root apply resumes child; delayed old child apply restores replica with stale tokens | Capture waited for fresh root then child acknowledgements; root/child timeout and false-suspend cases refused before scale/capture |
| Acknowledgement guards              | Remove lastHandledReconcileAt or spec.suspend comparison                                         | Each isolated removal caused exactly two expected negative failures                                                                |
| Pod drain                           | Pods never disappear                                                                             | Bounded refusal; all prior states and receipt preserved                                                                            |
| Snapshot identity/content           | Missing snapshot ID or zero processed bytes                                                      | No success receipt; service/Flux state recovered                                                                                   |
| Interrupted/failed mutation         | Errors after each accepted write, transfer failure, SIGTERM, concurrent invocation               | Compensation attempted registered writes; flock excluded overlap; prior receipt retained                                           |
| Failed compensation                 | Scale, rollout or resume consumer failure                                                        | Nonzero exit and precise manual command; remaining restores still attempted                                                        |
| Archive integrity                   | Flip actual restic pack byte; unreadable source produces restic exit3                            | Real `check --read-data`/backup failed; old receipt and cluster state retained                                                     |
| Decryption                          | SOPS identity absent                                                                             | Nonzero exit and no plaintext output; target roundtrip and second-host recovery succeeded                                          |
| Client authentication/trust         | No auth, wrong auth, absent CA, public-address connection                                        | HTTP401; actual CRI wrong credentials refused; curl60 without CA; public curl28                                                    |
| Restored image integrity            | Flip one byte of config blob only in a separate restored copy                                    | Existing `copyImage` rejected the expected digest mismatch; original snapshot/PVC/restored copy preserved                          |

## Live activation

The registry certificate, Deployment and Flux `platform` stage became Ready. `registry-secrets` reconciled the private merge revision. The public `puni-platform` GitRepository remains pinned to `584230c9e47b71cdb48e8d6397dc753e9aa93983`. Both nodes remain Ready. A before/after comparison proved the three website Deployment image references unchanged and replicas available; both dev frontends returned HTTP200.

The endpoint listens only on `10.1.0.4:5000`, forwarding TLS to the existing Service. No Docker restart was needed for builder trust. Initial Ansible changes were endpoint4, builder3 and each k3s client6; the complete second apply reported `changed=0`, `failed=0` on all three hosts, with no restart handlers.

Proof image: `registry.puni.internal:5000/activation/proof@sha256:d64cb980d81b07046773508c1fedb121f5df57132f40cbb8a640defbaadada66`. A Docker push from h2 succeeded. Both CRI image stores reported the reference absent before their successful configured pulls; wrong explicit credentials failed. Digest-pinned, Always-pull restricted proof pods ran on h3mon and h4claw and printed the expected marker. Completed proof pods were removed. Replacing the production registry pod changed its UID and preserved the exact manifest.

Before activation, the downstream observability/alerts/backup stages had zero inventories and had never reconciled. Durable root patches defer their first deployment; existing host monitoring and independent website backups continue. Root blanket child health remains unready while these stages are held; this is not presented as whole-platform readiness.

## Live backup and recovery

The reviewed runner is installed with SHA256 `ee41d36b1f52f65152bcdf6c061a1c4d02a2ef86b91c53c345bcd5aa806bc9bb`. Its first corrected live service run returned `Result=success`, `ExecMainStatus=0`, and snapshot `c17ae72d5cc090a585c71777689f40ecd0688f362bd39787a0a1e1a432e7fc7c` at `2026-10-24T14:12:06.093Z`, processing 104750292 bytes. `restic check --read-data` passed. Complete root/platform specs and annotations compared equal before/after, including the durable hold patches; the registry and website were available afterwards.

On h3, `restic restore <snapshot>:<sourcePvPath> --target <new-directory> --verify` restored 72 files/directories and verified 22 files. Two loopback-only Distribution containers served the restored store and an empty sink. The existing `copyImage` copied the pinned manifest and verified/uploaded all nine blobs. Removing the earlier disposable Docker reference and pulling again succeeded; the recovered image ran and printed the expected marker. An earlier snapshot drill also rejected a separately corrupted config blob using the same copier. All six disposable drill containers were removed; their files and receipts remain isolated from original storage.

After the corrected snapshot and restore passed, `puni-registry-backup.timer` was enabled and active. It schedules daily02:37UTC; first next elapse was `2026-10-25 02:37:00 UTC`. No snapshot pruning is enabled. Failures surface through systemd and leave the previous success receipt intact; external alert transport is not claimed. The installed service’s normal execution was exercised; live forced systemd termination was not injected (production CLI signal/cleanup tests cover that behavior).

The encrypted recovery bundle exists off-node; decryption and authenticated repository access passed on h3. Human-owned password-manager and hardware/offline custody remain unverified. Products have not migrated, and Dagger engine-specific DNS/trust remains a future migration prerequisite. Operational inputs, recovery details and rollback are in `docs/infra/registry.md` and `infra/systemd/registry-backup/README.md`.

## Resolved setup faults and remaining work

The Docker restore drill initially used an invalid nested readonly environment variable; Distribution2.8 requires the whole JSON readonly section. The restored target directory also needed ownership matching the container. These were corrected only in disposable drill setup, then the complete proof passed. Initial private formatting failures and the final review findings are likewise resolved; they are not counted as passing runs before correction.

Remaining required work: final exact-SHA gate, final verification/handoff commit and clean-tree check. Publication awaits explicit user approval because of automatic review’s public-disclosure block. Delta sync/archive and product migration are not silently marked complete.
