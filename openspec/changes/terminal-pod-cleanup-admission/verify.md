# Verification

## Scope and actual API baseline

The exact locked K3s node image and expected embedded v1.36.4+k3s1 reproduced the image-policy mechanism in an owned disposable local cluster. Binary tools were SHA-checked; the image's embedded K3s hash is separate from the standalone download pin, which remains unchanged. Explicit local Docker endpoint, private kubeconfig and context were used. Initial random-port kubeconfig failure and corrected endpoint evidence remain private. No product host or DB was touched.

The unchanged policy then refused real native-finalizer cleanup on an observed Failed/deleting Pod: `native-red-orphan.log` failed the unchanged expected-admission assertion with the exact trusted image-policy denial. The Pod retained Job-tracking, orphan and private sentinel keys; only the two native keys were removed in server-side dry-run. Setup-only YAML/CLI errors and initial fixture readiness races are retained and not credited as proofs.

## Invoked permanent coverage

`lab.ts` invokes `infra/platform/conformance/admission/terminal-cleanup-check.mjs` immediately after platform installation, before bootstrap/runtime. The helper requires explicit disposable kubectl/kubeconfig/context/evidence, creates inert unschedulable fixtures without PVCs, and restores the exact original image list on success. A separately scoped lab-only policy prevents actual finalizer changes; an observed real-update denial on a sentinel-only control establishes its informer readiness before any native keys exist. Ordinary DELETE uses Orphan propagation; no actual finalizer stripping runs.

The restored owning API suite passes 20 controls: Failed/Succeeded × tracking/orphan/both native reductions retaining sentinel; absent-to-empty optional metadata equivalence; refusal of live, nonterminal/deleting, terminal/nondeleting, changed spec/image/labels/annotations/owners, foreign-finalizer removal, unchanged finalizers, ephemeral subresource and retired-image CREATE. Added finalizers are refused by the existing Kubernetes deleting-object API invariant, explicitly attributed to that boundary rather than policy necessity. Every dry-run preserves the complete before/after object, exact UID/resourceVersion, deleting state and original keys.

## Watched production-path faults

Private raw evidence is under `/tmp/puni-k3s-admission-probe-20261108/guard-proofs-ready/`, indexed by `proof-pairs.json` and `guard-proofs-ready.log`.

| Omitted candidate guard    | Actual unchanged oracle                                     | Omitted / restored                     |
| -------------------------- | ----------------------------------------------------------- | -------------------------------------- |
| Old deletion timestamp     | Terminal/nondeleting update unexpectedly admitted           | 1 / 0                                  |
| Old terminal phase         | Nonterminal/deleting update unexpectedly admitted           | 1 / 0                                  |
| Unchanged spec             | API-valid active deadline update unexpectedly admitted      | 1 / 0                                  |
| Unchanged labels           | Extra label update unexpectedly admitted                    | 1 / 0                                  |
| Unchanged annotations      | Extra annotation unexpectedly admitted                      | 1 / 0                                  |
| Unchanged owner references | ConfigMap owner reference unexpectedly admitted             | 1 / 0                                  |
| Strict finalizer decrease  | Unchanged finalizers unexpectedly admitted                  | 1 / 0                                  |
| Native-only removed keys   | Sentinel removal unexpectedly admitted                      | 1 / 0                                  |
| Main-resource guard        | Remained refused by API metadata reset plus strict decrease | 0 / 0; no independent necessity credit |

All eight credited failures are actual expected-refusal assertions receiving admitted requests, not unrelated errors or timeouts. Each exact restoration passes all 20 API controls. CREATE's null oldObject, immutable UID/deletion identity and no additions after deletion rely on existing Kubernetes API boundaries; no redundant guards or fictitious omission credits were added. The redundant explicit subresource clause was removed after its omission retained all 20 controls; the final parsed policy matches that exercised omitted-clause variant. The permanent ephemeral negative remains. Final source is also rechecked by the full 20-control actual API suite.

## Synthetic drain fixture

Actual kubectl local transformation initially failed the owning absence assertion because it retained the unused CA dependency. Exact JSONPatch test/remove operations now strip only `/s3-trust` mount and its `sqlite-backup-s3` secret volume alongside unused environment. Original owner UID/reference, command's three-second SIGTERM delay, PVC/scratch/runner/runtime/security/grace and every unrelated field compare exactly.

A final actual server dry-run exposed the Secret defaultMode420 present in server-observed CronJobs; raw YAML omits it. The exact profile was corrected after its real local JSONPatch refused the defaulted input (`ca-defaulted-profile-red.log`). No new source behavior or defaults were guessed.

Four refreshed watched production patch faults on actual API-defaulted Job input (`ca-defaulted-proof-pairs.json` and `ca-defaulted-{omitted,restored}-*.log`): removing mount-shape or volume-shape test made unchanged expected-refusal controls accept a wrong readOnly/secretName; removing either removal left the unused dependency. All four owning assertions failed1 and exact restoration passed0. No actual cluster mount, S3 operation or workload was required.

## Focused checks and limits

- `tool-deploy:typecheck` and `tool-deploy:lint`: passed.
- `platform.test.ts`: 314 pass, 0 fail, 422 assertions.
- Focused lab migration/diagnostics/backup run:18 pass,4 sandbox listen refusals; exact backup file retry with localhost permitted:10 pass,0 fail,25 assertions. Sandbox refusals are not behavior failures or proof credit.
- Final exact source: actual API20/0, uncached typecheck/lint and scoped formatting passed; OpenSpec337/337 passed. Documentation/index validation requires tracked new paths; initial unstaged-path refusal is retained, staged retry recorded at handoff.
- Astra final source GO on policy83cc5842, helper649788e0 and lab235a7301: `/tmp/puni-merge-architecture-20261108/terminal-cleanup-source-review.md`.

No full workstation project suite, image build, aggregate CI, canonical host gate, adoption or deployment was performed by this worker. No production drain/UID/Lease/Orphan/budget/release-order rule changed. The original CI survivor's digest remains unobserved: this fixes a reproduced mechanism without claiming complete original-failure attribution. The disposable cluster and retained fixtures remain for Root-owned teardown after review.

The final CA profile was separately reviewed at lab09d2f852. Normal hooks then required explicit Node/Bun imports in the standalone MJS helper; its final hash is ed6c9e5e. Scoped ESLint and fresh actual API20/0 (`final-imported-api.log`) pass after that mechanical correction. The policy hash remains83cc5842. Final documentation/index checks passed after staging all new files.
