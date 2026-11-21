# Node roles verification

## Status

Plan only. No source outside this change and one glossary term, no manifest, host, cluster or
provider resource was changed. No task in tasks.md is done. This record holds only what was
read or run while writing the plan, on 2026-11-21 and 2026-11-23, in a worktree at
`origin/main` `b17861f83`.

## Replaced drafts

1. Commit `6ec66e655` planned an in-place migration with assumptions N1 to N14: a new node
   joined the running cluster, Flux and cert-manager moved to it, and the control plane
   followed by a snapshot restore. The owner then changed the premise: the cluster is recreated
   from scratch.
2. Commit `cf86bd350` planned that rebuild on Flux with assumptions R1 to R18 and a staged,
   reversible switch. A review at that commit returned "not ready" with three findings of the
   first rank. The owner then made two more decisions:
   - "For the new from scratch plan let's use the ArgoCD", and that the cluster is rebuilt the
     way it is meant to be built, with nothing carried over for its own sake.
   - "we can make the switch unsafe that's ok / no prod users yet".

The third draft, commit `d5cef1bfd`, keeps the R ids that still mean what they meant. Reworded
then: R1, R2, R5, R6, R8, R10, R12, R13 and R17. Withdrawn: R14 (the old side kept for 14 days)
and R18 (certificates cross as Secrets). New then: R19 to R27. Attended steps were renumbered
A1 to A22 and agent slices grouped in three phases.

A second review read `d5cef1bfd` and returned "not ready" with two findings of the first rank
and nine of the second. This revision answers it. Changed: R2 (disk floor), R12, R13, R17, R20
(the cluster follows `main`; the deploy branch is gone), R22 (count), R23, R25 (the taint).
New: R28 and slice 3.5. The unit table then had thirteen waves. Attended steps keep their
numbers.

A third review read `54825ed5d` and returned "not ready" with no finding of the first rank and
six of the second. This revision answers it. Changed: R20 (what guards `main`, and the
`delivery` rules inside a required check). No assumption is new. The unit table has fourteen
waves: Harbor moved to a last wave of its own and `signals` moved one wave later. Open
question 14 and design decision 10 are new. Slices and attended steps keep their numbers.

A fourth review read `17b95140a` and returned "not ready" with no finding of the first rank and
one of the second. Before it was answered the owner made the decisions recorded under "Owner
decisions" below. This revision, the fourth draft, answers both. What moved:

- **Assumptions.** Reworded: R2, R5, R11, R12, R13, R15, R19, R20, R22, R23, R28. New: R29
  (staging) and R30 (h1claw). Rows the owner has settled are marked decided.
- **Order.** The fourteen sync waves are gone. Units carry a sync order, 0 to 17, used by a
  sync playbook for the first sync only. OpenBao, the External Secrets Operator and
  `secret-sync` moved from wave 4 to orders 4 to 6, ahead of the issuers; `observability-secrets`
  became part of `secret-sync`; `elastic-settings`, `mlflow`, `public-issuers`,
  `website-staging` and `wbs-staging` are new units; Harbor moved from the last wave to order
  14, ahead of the WBS units.
- **Slices.** 2.5 gained the sync playbook and the controller's `sops` and fleet mount. 3.5 is
  now the WBS overlays, not the first-start coordinator. New: 3.6 (MLflow unit) and 3.7 (a
  merge becomes a staging pin). 21 slices.
- **Attended steps**, old to new: A1 to A3 unchanged; A4 is Argo CD with orders 0 to 3; old A6
  (etcd snapshots) is A5; old A7 (restore drill) is A6; A7 is new (OpenBao and the first
  Secrets); old A5 (measure Argo CD) is A8; old A8 is A9; old A9 and A11 (dev stacks on the CI
  host) are removed; old A10 is A10; old A12 is A11; old A13 to A16 are A12 to A15; old A17 and
  A18 are A16 and A17; A18 is new (staging); old A19 and A20 are A19 and A20; A21 and A22
  unchanged in number. 22 steps.
- **Questions.** Of fourteen, twelve are closed by the owner's answers or became assumptions.
  Two remain: the Slack channel, and what turns a merge into a staging pin.
- **Removed.** The h1claw re-pointing and the second pull set; the root's ignore rule for the
  WBS Application and its exemption in rule (b); the Application health customization; the
  spec requirement that a store keeps a scheduled backup while it moves.

## First review (at `cf86bd350`) and what became of its findings

Step, slice, wave, question and rehearsal-letter ids in the four tables that follow are those of the draft each
review read. "Replaced drafts" above maps them to this draft's.

Outcomes as the third draft recorded them. The second review, below, revised several: the
disk floor is 180 GiB, the taint and the h1claw pulls changed, and wave numbers moved.

| Finding                                                             | Outcome                                                                                                                            |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| S1-1 website cut-over without a freeze; one backup prefix           | Fixed: A19 stops the old writer, suspends its backup job and reconciler, restores one named stamp; own prefix (guard 3, slice 3.1) |
| S1-2 dev WBS and MLflow lose their backup                           | Fixed: A11 and A16 re-point h1claw's pull and need the first verified set from the new host (R13, guard 6)                         |
| S1-3 a pin advance on the old cluster could prune its registry      | Moot by design: no path the old cluster reconciles is edited (R21, spec requirement, slice 2.4's closure check)                    |
| S2-4 shared Flux overlay and cert-manager stage break workers, labs | Moot by design: the old slices 1.3 and 1.5 are gone; the new tree is separate                                                      |
| S2-5 unpinned workloads beside the secret store                     | Fixed with both: a platform taint (R25, slice 1.2) and a selector check with overlay patches (slice 2.4)                           |
| S2-6 staged joins cannot run as written                             | Fixed: create, then the 1.3 revision, then `firewall.yml` on existing members, then join (A13/A14, A17/A18)                        |
| S2-7 secrets and fleet source incomplete                            | Fixed: the secret table of design decision 5, namespaces before Secrets, the fleet Application in wave 9                           |
| S2-8 CI ordering and scope                                          | Fixed: stacks measured before pool init (A9, A10); the CI role defined as branch code; jump on h5plat (R17); A21/A22 need A10      |
| S2-9 hard-coded observability source binding                        | Fixed: slice 1.5                                                                                                                   |
| S2-10 observability disk not sized                                  | Fixed: 173 GiB floor decided before creation (R2, A13), growth measured in A15                                                     |
| S2-11 how carried certificates are created                          | Moot under R26: certificates and ACME accounts are issued anew after DNS                                                           |
| S3 keep `letsencrypt-staging`                                       | Fixed: slice 2.3                                                                                                                   |
| S3 slices without a named fault                                     | Fixed: every slice that adds a check names one; the header says so                                                                 |
| S3 A6 omits preparing the temporary server                          | Fixed: A7                                                                                                                          |
| S3 probes miss the CI host                                          | Fixed: slice 3.2                                                                                                                   |
| S3 the rehearsal names no host                                      | Fixed: slice 2.7                                                                                                                   |
| S3 unlimited preflight fails on h8ci                                | Fixed: every play is limited (tasks.md header)                                                                                     |
| S3 new etcd bucket needs versioning and lifecycle                   | Fixed: A6                                                                                                                          |
| S3 A16 lacks its fields                                             | Fixed: A20                                                                                                                         |

Made moot by the unsafe switch (R26), beyond S2-11: testing against the ingress address before
DNS, lowered record TTLs, the certificate carry-over rehearsal, and the 14-day retention of the
old side. What R26 does not relax is design decision 7's list of guards.

## Second review (at `d5cef1bfd`) and what became of its findings

| Finding                                                             | Outcome                                                                                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| S1-1 WBS production loses its backup between A11 and A20            | Fixed: the h2puni pull stays until A22; the CI host gets a second set; freshness is judged per set (R13, guard 6, A11, A22)             |
| S1-2 wave 3 reads a Secret that arrives in wave 4                   | Fixed: waves re-derived from what each unit reads; the `otel-server` pair is its own unit one wave after its Secret (design decision 3) |
| S2-3 node agents contradict the taint rule                          | Fixed: a named exemption for three DaemonSets, with a negative for a fourth (design decision 1, slice 2.4(f), spec)                     |
| S2-4 k3s system pods do not tolerate a custom taint                 | Fixed by a simpler choice: `CriticalAddonsOnly=true:NoSchedule`, which the packaged components tolerate. Read, see "k3s behaviour"      |
| S2-5 the deploy branch cannot enforce "a gated commit of `main`"    | Removed by a simpler rule: the cluster follows `main` and the pull-request rules are the control (R20, task 0.6). Rollback is a revert  |
| S2-6 Flux-only apply semantics lost in render-equal copies          | Fixed: the inventory table in design decision 3, checks 2.3 and 2.4(i), rehearsal items (i)                                             |
| S2-7 A20 needs a Flux unit                                          | Recorded as a gap with an owner: slice 3.5 and R28; A20 cannot start before it                                                          |
| S2-8 waves order only the root's sync; break-glass is reverted      | Fixed: stated in design decision 3 and the spec; retry with backoff on every Application; break-glass disables the root first           |
| S2-9 projects and cluster-scoped resources; the root's own project  | Fixed: `apps` admits `ClusterIssuer` only; the playbook applies both AppProjects with the root (slice 2.5)                              |
| S2-10 A7 powers off the jump                                        | Fixed: the fallback jump is the target's own public SSH endpoint, which `k3s.nft.j2` keeps open (R17, A7)                               |
| S3 disk floor                                                       | Fixed: (114 + 30) / 0.8 = 180 GiB, against eviction at 10% and 15%                                                                      |
| S3 Traefik in an early wave                                         | Fixed: its Application lands with the production apps node (wave 11, A18); nothing earlier needs it                                     |
| S3 `argocd-secret` and server-side apply                            | Fixed: `ServerSideApply=true` on the `argocd` Application; rehearsal (d) asserts the hash and keys; fallback stated                     |
| S3 scenarios without negatives; one fault for several checks        | Fixed: slices 2.1, 2.4 and 3.1 name a negative and a fault per check                                                                    |
| S3 step fields                                                      | Fixed: A17 has a Stop; A21 and A22 need the pool owner's word and open question 8; guard 2 and task 0.5 name the same four secrets      |
| S3 app secrets, the seal key, the count                             | Fixed: the owner writes app Secrets into OpenBao in A19 and A20; the playbook's second run is tested (slice 2.5); the count is fifteen  |
| S3 chart lock                                                       | Fixed: one entry per chart version; a bump adds, never rewrites                                                                         |
| S3 data claim overstated                                            | Fixed: operator-created claims are named, their custom resources carry the options, and what delivery cannot protect is stated          |
| S3 hygiene: a quote, a location, new ids and addresses              | The quote is paraphrased and the location removed. Ids and addresses: disputed in part, see below                                       |
| S3 task 0.1 lets 2.7 start early; A9 restores production data on CI | Fixed: 2.7 follows 2.1 to 2.5; A9 and A11 restore the dev members only                                                                  |

Disputed in part: that slice 1.3 must not publish machine ids and private addresses. The fleet
model needs both in `infra/fleet/desired.yaml` and the inventory (`desired.yaml:21,26`,
`production-existing-hosts.yml:22-26,41-44` carry them for the two existing nodes), and
`require-enrollment-identity.yml` compares them at enrollment. Slice 1.3 follows that
convention and keeps public addresses and provider ids out of the repository. Whether the
inventory should move to the private repository first was open question 13 of that draft; the
owner has since decided that they follow the existing fleet file (R5).

## Third review (at `54825ed5d`) and what became of its findings

| Finding                                                             | Outcome                                                                                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 the enrollment patch drops CoreDNS's packaged toleration       | Fixed: slice 1.2 makes the play append the enrollment toleration, with a negative for a replaced list. Dropping the taint is no longer an automatic fallback        |
| S2-2 nothing creates the identity ConfigMap                         | Fixed: `argocd.yml` creates it when absent and refuses another id (slice 2.5)                                                                                       |
| S2-3 the WBS first start against the root's self-heal and rule (b)  | Fixed: the root ignores `/spec/syncPolicy` of `wbs` only; rule (b) exempts that one Application and refuses any other; rehearsal (n)                                |
| S2-4 a restore into a claim a running Deployment holds              | Fixed: stateful apps land at zero replicas with the backup job suspended; the receipt's backup postdates the restore and shows a restored record (guard 1, A19)     |
| S2-5 R20's control weaker than claimed                              | Fixed: today's rules stated; the `delivery` rules run as a real-tree test inside `gate`; task 0.6 covers both repositories before A2; the rest listed as a risk     |
| S2-6 "Harbor blocks no stage" against wave 5                        | Fixed: nothing in the tree reads from Harbor, so it is alone in the last wave                                                                                       |
| S3 a revert orphans workloads                                       | Fixed: removal is two merges, stated in design decision 3 and in the rollbacks of A15 and A18                                                                       |
| S3 three Flux semantics missing from the inventory                  | Fixed: `healthCheckExprs`, chart `crds/` directories and the release name are rows; rule 2.4(j), slice 2.2's test, rehearsal (k) to (m). Velero citation fixed      |
| S3 freshness series and an absent-series negative                   | Fixed: slice 3.1 names the two kube-state-metrics series and fires on absence                                                                                       |
| S3 prefix refusal and h1claw's judgement of old prefixes            | Fixed: any prefix under `sqlite/` is refused; h1claw's owner confirms before A21                                                                                    |
| S3 alerts that fire falsely from A15                                | Fixed: the WBS backup group lands with the `wbs` Application; the workers rule is not copied; a check refuses a rule with no subject                                |
| S3 `signals` reads operator-made Secrets                            | Fixed: `signals` is one wave after Elasticsearch; the provider rule knows four kinds of provider                                                                    |
| S3 owners for four things                                           | Fixed: `registry-tls` is Harbor's; `website-prod-logs` is in the `namespaces` unit; OpenBao's namespace likewise; fleet and WBS overlays carry (f), (g), prefix     |
| S3 no deadline for slice 3.2; no escrow for the Velero password     | Fixed: 3.2 before A15; A15 escrows the password before writing it                                                                                                   |
| S3 the h1claw tarball mixes production env files                    | Fixed: unpacked on the controller; only dev paths reach the CI host (guard 6, A9, A11)                                                                              |
| S3 A21 removes the old fleet directory without the pin owner's word | Fixed: a precondition of A21                                                                                                                                        |
| S3 CoreDNS budgeted on the platform node but not pinned             | Stated: k3s packages it without a selector and reverts a patch; the budget counts it as the worst case                                                              |
| S3 Harbor's step ids collide with this plan's                       | Fixed: written as Harbor-A1, Harbor-A2a, Harbor-A9 and Harbor-A11                                                                                                   |
| Not verified: where WBS images are pulled from                      | Stated in design decision 9; the host is not in the source read, so it was open question 14 of that draft, since settled by R28 (Harbor), and a precondition of A20 |

Nothing was disputed in this round.

## Fourth review (at `17b95140a`) and what became of its findings

| Finding                                                                      | Outcome                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S2 task 0.6's receipt could write to `main` with no rollback                 | Fixed: forced and deleting pushes are proved by reading the rules back; the direct push is one empty commit from an account outside the bypass list; the tip SHA is recorded first and the restore is stated |
| S3 a two-merge removal stalls on an empty source                             | Fixed: the emptied source keeps one marker ConfigMap, so no sync renders nothing (design decision 3, rehearsal (o))                                                                                          |
| S3 CRD inventory missed the Prometheus stack                                 | Fixed: ten CRDs in its `crds` subchart are counted; rule 2.4(j) looks at any depth; slice 2.8 has a negative; rehearsal (k) reads them back                                                                  |
| S3 the operator-Secret rule fails on a faithful copy                         | Fixed: a Job may read a Secret an operator makes for its own unit (`kibana-objects`); `elastic-settings` is a unit of its own one order after Elasticsearch; the operator table has three rows               |
| S3 `sqlite-custody` rules have no subject at A15                             | Fixed: the unit holds retention only; each app's stale-backup rule lands with that app (slice 3.1)                                                                                                           |
| S3 the controller cannot decrypt, and the workstation cannot build its image | Fixed: slice 2.5 adds `sops` and a fleet checkout mount; until the workstation has room the image is built and run on h2puni, where the controller runs today (design decision 10)                           |
| S3 rehearsal on the first server                                             | Fixed: a rehearsal server is never recorded; the pass uses its own secrets, an uncommitted inventory and a scratch bucket; A1's receipt has the SSH host key                                                 |
| S3 Harbor in a last wave could hold the root's sync                          | Moot: no unit waits on a wave any more (R20); Harbor is synced on command at order 14                                                                                                                        |
| Nit: a blank line broke a table in this file                                 | Fixed                                                                                                                                                                                                        |
| Nit: validation needs `--limit h5plat`                                       | Fixed: A13, and A17 through it                                                                                                                                                                               |
| Nit: stage 0's receipt named two phases                                      | Fixed: it names the slices decision 4 lists for stage 1                                                                                                                                                      |
| Nit: fingerprints in a public receipt                                        | Fixed: task 0.5 and A2 record "matched" and "escrowed" only                                                                                                                                                  |

Made moot by production and the platform being synced on command (R20): the root's ignore rule
for the WBS Application and rehearsal item (n) of the third draft; the health customization and
the stall it could cause; "later changes are not ordered" for anything but staging.

Nothing was disputed in this round.

## Fifth review (at `abb1fbd90`) and what became of its findings

The review returned "not ready" with no finding of the first rank and five of the second. This
revision, the fifth draft, answers it and two owner inputs of 2026-11-23 (the alert channel,
and his lean to building staging images on the CI host). New: R31, R32, slice 3.8, rules
2.4(l) and (m), the `root` project, `puni.dev/needs`, the removal mode. Reworded: R12, R20,
R23, R30. The rehearsal's lettered receipt became four receipts named by the step each gates
(2.7/A3, 2.7/A7, 2.7/A14, 2.7/A18). The order table has one row per unit; orders are
unchanged, and `sqlite-custody` is first synced at A18. Attended steps keep their numbers. 22
slices, 22 steps, R1 to R32, three open questions.

| Finding                                                  | Outcome                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 "on command" had no check on the root's path        | Fixed: a `root` project that admits only Application and AppProject in the Argo CD namespace; rule (l) refuses any other kind there and an `operation` block; the root does not prune, so a removed file changes nothing; design decision 3 states what a merge to an Application file does and does not do |
| S2-2 the account could roll back                         | Fixed: `server.rbac.rollback.enforce.enable` is set (read in the RBAC guide at the tag); negative in 2.1; rehearsal 2.7/A3                                                                                                                                                                                  |
| S2-3 stage 1 could not start as ordered                  | Fixed: four receipts, each due before the step it gates; A3 needs 2.7/A3 only                                                                                                                                                                                                                               |
| S2-4 WBS staging beside production under-scoped          | Fixed: slice 3.8 makes the solver binding a table of environments in the new tree's policy copy and in the `solver` role; 3.5 names the namespaces and default-deny policies. A node of its own for staging would not remove this work (design decision 1)                                                  |
| S2-5 the sync playbook's refusal blocked unrelated units | Fixed: it refuses on a unit's declared needs only; the order table has a Needs column the check holds; design and tasks agree                                                                                                                                                                               |
| S3 `sqlite-custody` timing; 1.4 omitted                  | Fixed: first synced at A18; decision 4 lists 1.4 and 1.5 before stage 3                                                                                                                                                                                                                                     |
| S3 `secret-sync` before `mlflow`                         | Fixed in A15                                                                                                                                                                                                                                                                                                |
| S3 who creates the stores for app namespaces             | Fixed: `secret-sync` carries one SecretStore per reading namespace; the roles and paths are asked of #935 (decision 9)                                                                                                                                                                                      |
| S3 the WBS deploy repository                             | Fixed: task 0.6 covers it; its absence has a stated fallback; what the `delivery` check reads is stated                                                                                                                                                                                                     |
| S3 rule (k) missing from the fleet check                 | Fixed: it carries (f), (g), (k), (m) and the prefix rule                                                                                                                                                                                                                                                    |
| S3 a staging Ingress claiming a production host          | Fixed: rule (m)                                                                                                                                                                                                                                                                                             |
| S3 one bucket key lets staging read production backups   | Fixed as a requirement and a check; whether the provider can scope a key is unverified and listed as a risk until settled                                                                                                                                                                                   |
| S3 h1claw's mixed set serving a staging restore          | Fixed: only the named member, by file; the archive is never unpacked on the cluster (guard 6)                                                                                                                                                                                                               |
| S3 A22 lacked the Slack precondition                     | Fixed                                                                                                                                                                                                                                                                                                       |
| S3 staging hostnames and issuer against A18's wording    | Fixed: A18 uses the names and issuer each overlay declares; WBS staging's certificate is from the ACME staging issuer                                                                                                                                                                                       |
| S3 the root's path against "no Application owns it"      | Fixed: the root and its project are in `infra/argocd/root`, outside the root's source path                                                                                                                                                                                                                  |
| S3 the second-account fallback against R23               | Fixed: no automatic fallback; the owner decides                                                                                                                                                                                                                                                             |
| S3 stale references to questions 13 and 14               | Fixed in this file                                                                                                                                                                                                                                                                                          |
| Backup windows stated as the owner's decision            | Fixed: one table in design decision 7; R30's consequences await his confirmation in task 0.1                                                                                                                                                                                                                |

Nothing was disputed in this round.

## k3s behaviour

Read on 2026-11-21 for k3s v1.36.4+k3s1, the locked version.

| Relied on                                                                                            | Where it was read                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| CoreDNS, the volume provisioner and the metrics server tolerate the key `CriticalAddonsOnly`         | `manifests/coredns.yaml`, `local-storage.yaml`, `metrics-server/metrics-server-deployment.yaml` at the tag |
| The same three tolerate nothing else but the control-plane taint                                     | the same files; `kubectl get deploy -n kube-system` on the live cluster                                    |
| k3s names `CriticalAddonsOnly` for a dedicated control plane                                         | k3s documentation, `datastore/ha.md` (its example uses the `NoExecute` effect)                             |
| Packaged manifests are applied again on start and when the file changes                              | k3s documentation, `installation/packaged-components.md`                                                   |
| A patched toleration does not last: the live CoreDNS lacks the enrollment toleration once patched in | the live Deployment, against `validate-enrollment.yml:79-83`                                               |
| `node-taint` is applied only when the node registers                                                 | k3s documentation, `cli/agent.md`                                                                          |
| The only DaemonSet on the live cluster is Traefik; Flannel and kube-proxy are not pods               | `kubectl get ds -A`                                                                                        |
| The enrollment probes are bound by `nodeName` and so are not held back by a `NoSchedule` taint       | `validate-enrollment.yml:108-114,152-158`                                                                  |
| Every server registers with the enrollment taint as well                                             | `roles/k3s_server/templates/config.yaml.j2:24-25`                                                          |
| The CoreDNS step is a strategic patch of `tolerations`, a list with no merge key                     | `validate-enrollment.yml:73-83`                                                                            |

Not run: a one-node cluster registered with both taints. Slices 1.2 and 2.7 own it.

## Argo CD behaviour

Read on 2026-11-21 from the documentation at the `stable` ref and from source at tag `v3.6.2`
(`VERSION` reads 3.6.2; the newest chart release is `argo-cd-10.18.2`).

| Relied on                                                                                                                                                                   | Where it was read                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Charts are rendered with `helm template`; Argo CD owns the lifecycle                                                                                                        | `docs/user-guide/helm.md`                                                                |
| Helm hooks map to sync hooks; test hooks are skipped; delete policies differ                                                                                                | `docs/user-guide/helm.md`, "Helm Hooks"                                                  |
| A chart that generates random data renders differently each time                                                                                                            | `docs/user-guide/helm.md`, "Random Data"                                                 |
| `helm dependency build` runs only after a missing-dependency error                                                                                                          | `reposerver/repository/repository.go`, `util/helm/helm.go`                               |
| Symbolic links are refused only when they leave the repository root                                                                                                         | `reposerver/repository/repository.go`                                                    |
| Waves order resources; a wave proceeds when its resources are healthy                                                                                                       | `docs/user-guide/sync-waves.md`                                                          |
| Application health was removed in 1.8 and must be restored for waves across apps                                                                                            | `docs/operator-manual/health.md`, `cluster-bootstrapping.md`                             |
| App of apps is an admin-level tool; push access to its source is admin access                                                                                               | `docs/operator-manual/cluster-bootstrapping.md`                                          |
| Automated sync does not prune or self-heal unless asked; self-heal retries                                                                                                  | `docs/user-guide/auto_sync.md`                                                           |
| Tracking is by annotation by default                                                                                                                                        | `docs/user-guide/resource_tracking.md`                                                   |
| `ServerSideApply=true`, `Prune=false`, `Delete=false`; the 262,144-byte limit                                                                                               | `docs/user-guide/sync-options.md`                                                        |
| `ignoreDifferences`, and the webhook `caBundle` example                                                                                                                     | `docs/user-guide/diffing.md`                                                             |
| Repository credentials as labelled Secrets; SSH host keys in a ConfigMap                                                                                                    | `docs/operator-manual/declarative-setup.md`, private repos guide                         |
| Self-management from a kustomize application; server-side apply for the install                                                                                             | `docs/operator-manual/declarative-setup.md`, `installation.md`                           |
| `policy.default`, `role:readonly`, local accounts, disabling `admin`                                                                                                        | `docs/operator-manual/rbac.md`, user management guide                                    |
| Deleting an Application without the finalizer leaves its resources                                                                                                          | `docs/operator-manual/cluster-bootstrapping.md`                                          |
| `RespectIgnoreDifferences=true` acts only on an object that already exists                                                                                                  | `docs/user-guide/sync-options.md`                                                        |
| `Force=true` needs `Replace=true` and is ignored under server-side apply                                                                                                    | `docs/user-guide/sync-options.md`, "Force Sync"                                          |
| Retry with exponential backoff; self-heal retries after its timeout                                                                                                         | `docs/user-guide/auto_sync.md`                                                           |
| Child applications are not ordered or awaited without the health customization                                                                                              | `docs/operator-manual/cluster-bootstrapping.md`                                          |
| A kustomize source may inflate a Helm chart with `--enable-helm`                                                                                                            | `docs/user-guide/kustomize.md`                                                           |
| Cluster-scoped kinds are admitted to a project by an allow list                                                                                                             | `docs/user-guide/projects.md`                                                            |
| `sync` and `override` are separate actions; a revision other than the Application's needs `override` when `application.sync.requireOverridePrivilegeForRevisionSync` is set | `docs/operator-manual/rbac.md` at tag `v3.6.2`, read 2026-11-23                          |
| The CLI's `--core` flag talks to Kubernetes directly, not to the API server                                                                                                 | `docs/user-guide/commands/argocd.md` at the tag                                          |
| Automated prune refuses a source with no resources unless `allowEmpty` is set; `automated.enabled: false` switches automation off                                           | `docs/user-guide/auto_sync.md` at the tag                                                |
| Rollback is authorised by `sync` unless `server.rbac.rollback.enforce.enable: 'true'` is set in `argocd-cm`; it cannot run while auto-sync is on                            | `docs/operator-manual/rbac.md` at tag `v3.6.2`, "The `rollback` action", read 2026-11-23 |
| `argocd_app_info` carries `sync_status` and `health_status`                                                                                                                 | `docs/operator-manual/metrics.md` at the tag                                             |

Not read or not provable from reading; slice 2.7 owns each:

- Whether helm itself follows a linked archive in `charts/`, and whether kustomize inflates a
  chart from a local archive without fetching.
- Whether self-management overwrites the password hash or the generated keys in
  `argocd-secret`.
- That the bundled health check keeps an ExternalSecret unhealthy until its value arrives. The
  health customization files were not read.
- That later changes in several children converge by retry in practice. The documentation says
  what waves order; it gives no guarantee for this case.
- That a Helm source includes the `crds/` directory of a wrapper's dependency, and that
  kustomize does with `includeCRDs: true`. Not read; rehearsal 2.7 reads the CRDs back.
- That the bundled health check for `cert-manager.io/Certificate` behaves as the Flux
  `healthCheckExprs` it replaces. Rehearsal 2.7/A14.
- That core mode can sync and wait with the node's credential alone, that the override
  setting is enforced in the interface, and that the rollback setting refuses the account.
  Rehearsal 2.7/A3.
- That an applied `operation` block starts a sync, and that a root without prune leaves an
  Application whose file was removed.
- That an automated root leaves an unautomated child unsynced and reverts an edit to its sync
  policy. Rehearsal 2.7/A3.
- Which fields need `ignoreDifferences` for these charts.
- Argo CD's memory on this cluster. 1,536 MiB is an assumption (R24).
- The ApplicationSet documentation was not read; the choice against it rests on the
  bootstrapping guide's description only.

## Failure proofs

No check exists yet, so there is nothing to break. Each slice that adds a check names the fault
it must inject. This table is filled as slices land.

| Safety boundary | Injected fault and observing test | Observed proof |
| --------------- | --------------------------------- | -------------- |
| none yet        |                                   |                |

## Owner decisions

The decisions of 2026-11-21 are recorded above under "Replaced drafts". On 2026-11-23, in his
words where they carry the decision:

- "I'd like to setup openbao before other stuff" (R22).
- "i want the main to act like staging ...; so what merges to main - gets deployed on
  staging; however prod deployment is done by hand/on command" (R20).
- MLflow is kept (R15).
- h1claw: the owner said it may be deleted at any time. That sentence is a paraphrase by the
  planning session, and the two consequences in R30 were stated to him, not decided by him.
  Task 0.1 records his confirmation in his own words.
- Alerts go to the Slack channel `#puni-alerts-dev`.
- Staging images: he leans to building on the CI host and asked how CI is triggered. R31 is
  the planning session's recommendation and awaits his confirmation (open question 2).
- Server shapes confirmed: three of 8 vCPUs and 16 GiB, one CI host of 16 vCPUs and 32 GiB
  (R2).
- Staging on the apps node as namespaces confirmed, with the remark that production may want a
  server of its own later; staging therefore has its own capability (R29, design decision 1).
- The other recommendations then on the table were accepted: the names (R3); the owner creates
  the servers (R4); machine ids and private addresses follow the existing fleet file (R5); the
  rehearsal on the first new server (design decision 10); rules on the fleet repository
  before first use (task 0.6); WBS production moves the simple way, with images from Harbor
  (R28); backups inside the new cluster (R13); the website's fleet directory written by its
  owning session, moved after its release bootstrap (R11); one local account (R23).

Overrules of R1 to R32 beyond these: none yet (task 0.1).

## Read-only readings

| Reading                                           | Result                                                                                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kubectl get nodes` capacity and allocatable      | h4claw and h3mon: 8 CPUs, 15,602 MiB; allocatable 13,299 and 13,939 MiB; about 150 GiB of node storage                                                               |
| `kubectl top nodes`                               | h4claw 3,291 MiB, h3mon 4,316 MiB                                                                                                                                    |
| Node labels                                       | h4claw: `control-plane`, `ingress`, `product`; h3mon: `observability`; no taints                                                                                     |
| Node selectors of every Deployment                | Flux, cert-manager and kube-system: `kubernetes.io/os` only; website: `capability-product`                                                                           |
| Memory limits per namespace, running pods         | flux-system 4,096; website-dev 768; website-prod 128; website-prod-logs 128; puni-registry 512                                                                       |
| Containers without a memory limit                 | cert-manager 3, Traefik 1, kube-system 2 on h4claw                                                                                                                   |
| Persistent volumes                                | two, class `puni-retain`, policy `Retain`, node affinity by host name to h4claw                                                                                      |
| Storage classes                                   | `local-path` is the default with policy `Delete`; `puni-retain` and `puni-local` have `Retain`                                                                       |
| Flux stages                                       | `target`, `controllers`, `storage`, `policy`, `secrets`, `platform` Ready; `observability`, `alerts`, `backup` not Ready                                             |
| Flux sources                                      | the platform source is pinned to one commit; the fleet source follows a branch and owns the website and registry-secret units                                        |
| `nproc`, `free -m`, `df -h /` on h2puni           | 8 CPUs, 15,603 MiB, 127 of 150 GiB used (88%)                                                                                                                        |
| User timers on h1claw                             | hourly SQLite pull from h2puni, daily MLflow pull, daily remote prune, weekly restore drill, freshness alert; last run healthy                                       |
| The fleet repository's file list                  | its website overlay holds encrypted Secret files; its cluster directory holds Flux units. No content is quoted                                                       |
| `/dev/kvm` on the operator workstation            | present; the workstation's disk was full, so no lab ran                                                                                                              |
| Tolerations of the packaged components            | CoreDNS, `local-path-provisioner`, `metrics-server`: `CriticalAddonsOnly` (Exists) and the control-plane taint, nothing else                                         |
| DaemonSets on the live cluster                    | Traefik only, selecting `capability-ingress`                                                                                                                         |
| Rules on this repository's `main`                 | one active ruleset: `pull_request` with zero required approvals; `required_status_checks` `gate` and `pixels`, not strict; no rule against forced or deleting pushes |
| `infra-check.yml`                                 | runs `tool-fleet:check` on pull requests that touch its paths; it is not among the required checks                                                                   |
| `crds/` directories in the vendored archives      | Traefik 25 files, Velero 13; the other eight archives none                                                                                                           |
| CRDs in the Prometheus stack archive              | ten files under `charts/crds/crds/`                                                                                                                                  |
| Kinds under `infra/platform/policy` and `storage` | no cert-manager kind, so both can precede cert-manager                                                                                                               |
| WBS overlays                                      | `staging` and `prod` both render into `wbs` and `wbs-solver`                                                                                                         |
| Controller image                                  | installs `kubectl` only; no `sops`                                                                                                                                   |
| Helm release names                                | no `HelmRelease` sets `releaseName`; `otlp-ingress.yaml` selects `app.kubernetes.io/instance: otel-collector`                                                        |
| Roles of `bootstrap.yml` and `join.yml`           | `base`, `network`, `storage` and the k3s role; `registry_client` runs only from `registry.yml`                                                                       |
| Members of h1claw's hourly set                    | five per stamp, WBS production and WBS dev among them, all pulled from h2puni                                                                                        |

## Repository checks

Dependencies were not installed in the worktree: the laptop's disk was full. The binaries of the
main checkout were used through a temporary `node_modules` link, removed afterwards. The rows
below were run again on this revision, on 2026-11-23.

| Command                                                                                                     | Result                                                                    |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `openspec validate separate-node-roles --strict`                                                            | `Change 'separate-node-roles' is valid`, exit 0                           |
| `openspec validate --all --json`                                                                            | 349 items, 349 passed, 0 failed                                           |
| `prettier --check` on the five plan files and `CONTEXT.md`                                                  | `All matched files use Prettier code style!`                              |
| `env -u CLAUDECODE bun test` on `adr-index`, `repo-namespacing-handoff`, `current-documents` (tool-devsync) | 34 pass, 0 fail, 109 assertions, 3 files. Changed files were staged first |
| `env -u CLAUDECODE bun test tools/tool-rename-work-package`                                                 | 37 pass, 0 fail, 89 assertions, 4 files                                   |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                 | exit 0, empty stderr                                                      |
| `plaintext-secrets.ts` and `private-nesting.ts` on the five plan files (`tools/tool-git-hooks/src/hooks`)   | each exit 0                                                               |
| Intent word count of proposal.md, "Why" to "Constraints"                                                    | 397                                                                       |

## Checks not run

- `bun install --frozen-lockfile` and every Nx target, `tool-devsync:check:docs` included: no
  disk space. CI runs them.
- `check-documents-target.test.ts`: each run leaves about 2.8 GB under `/tmp`.
- No lab, VM, cluster or Argo CD rehearsal: slice 2.7 owns that.
- No playbook was run. What the playbooks do was read from their sources and from the runbooks'
  records of earlier runs.
- This revision has not been reviewed. The five reviews recorded above read earlier commits.

## Primary sources read

- For the fifth draft: `infra/platform/policy/trusted-workloads.yaml`, the `solver` role's
  tasks, `deploy/k8s/wbs/base/backend.yaml` and both overlays' namespaces (the solver binding);
  `.github/workflows/ci.yml` and `deploy-k3s.yml` (triggers and the one self-hosted runner);
  `infra/jobs/catalogue.json` and the `concurrencyEligible` section of
  `docs/infra/gate-hosts.md`; the Argo CD RBAC guide at tag `v3.6.2` (rollback).

- `infra/fleet/desired.yaml`; `infra/ansible/inventory/production-existing-hosts.yml`; the play
  lists of `bootstrap.yml`, `join.yml`, `platform.yml`, `firewall.yml`, `backup.yml`,
  `restore.yml` and `validate-enrollment.yml`; the `k3s_server` and `k3s_agent` configuration
  templates; the `network` role's firewall template.
- `tools/tool-fleet/src`: `contracts.ts` (capabilities, the server-count rule), `platform.ts`
  (`validatePlatform`, stage dependencies and placement), `check.ts`, `health.ts`,
  `observability-source.ts`, `lab.ts`.
- `infra/clusters/platform/production`; every `HelmRelease` under `infra/platform`;
  `infra/platform/secrets/platform-production/externally-provided.json`; the policy namespaces;
  the registry issuers; the observability claims; `infra/versions/toolchain.json`.
- `docs/infra/README.md`, `fleet.md`, `platform.md`, `recovery.md`, `registry.md`,
  `enroll-h4claw-h3mon.md`, `gate-hosts.md`, `cutover-plan.md`, `observability-sizing.md` and
  `local.md`.
- `deploy/k8s/wbs/base` and its overlays.
- `openspec/changes/adopt-harbor-registry`: design decisions 2, 4 and 10, the assumption table
  and the task list.
- The Argo CD documentation and source listed above.
- For the fourth review and the decisions of 2026-11-23: the design file of pull request #935
  at its branch (placement, seal, self-init, server certificate, bootstrap set, stage graph);
  `infra/controller/Containerfile`; `deploy/k8s/wbs/overlays/staging` and `prod`;
  `infra/platform/policy` and `storage` by kind; the Prometheus stack archive's file list;
  `observability/elastic/settings/settings.yaml` and `kibana/objects/job.yaml`; the four Argo
  CD pages named above at tag `v3.6.2`.
- For the third review: `validate-enrollment.yml` and the `k3s_server` template's taints; the
  identity ConfigMap tasks of `platform.yml`; `alerts/base/rules.yaml` and the production
  overlay; `observability/base/signals.yaml`; `registry/production/issuers.yaml`;
  `policy/namespaces.yaml`; the archives' file lists; `.github/workflows/infra-check.yml`;
  `platform.test.ts`; `docs/infra/recovery.md` on the h1claw sets and the prune; the Harbor
  change's context and attended steps.
- For the second review: every Flux unit under `infra/clusters/platform/production` with its
  `dependsOn`; the Flux annotations and `HelmRelease` fields under `infra/platform`;
  `policy/trusted-images.yaml`; the Velero `HelmRelease`; `certificates/platform/production`;
  `registry/production/issuers.yaml`; `docs/infra/cutover-plan.md` prerequisites and steps 6
  and 8; `tools/tool-deploy/src/k8s/first-start-source.ts`; the kubelet arguments in both k3s
  templates; `docs/infra/gate-hosts.md` on the controller's jump; the k3s manifests and
  documentation listed under "k3s behaviour".
