# Node roles verification

## Status

Plan only. No source outside this change and one glossary term, no manifest, host, cluster or
provider resource was changed. No task in tasks.md is done. This record holds only what was
read or run while writing the plan, on 2026-11-21 and 2026-11-22, in a worktree at
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
revision, the fifth draft, answers it and two owner inputs of 2026-11-21 (the alert channel,
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

## Sixth review (at `6fd22d49a`) and what became of its findings

The review returned "not ready" with no finding of the first rank and three of the second.
Before it was answered the owner made three more decisions (below). This revision, the sixth
draft, answers both. Reworded: R2, R3, R12, R29 (now decided: a non-production node), R30 (now
decided), R31 (now decided: one executor, several triggers), R32. New: R33 (what staging and dev are for), rule
2.4(n), slice 3.9 (the dev environment), the role "non-production" with its host `h9stg`, and
the capability `nonproduction`, which replaces the fifth draft's `staging` capability. Rules
now run (a) to (n). Attended steps keep their numbers: A16 creates two servers and A17 joins
both. 23 slices, 22 steps, R1 to R33, three open questions.

| Finding                                                                                                  | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 the supervisor program is literal too: caller name, node-wide sweep and cap, uid, per-digest writes | Resolved by the owner's decision and a smaller slice: staging and dev run on a node of their own (R29), away from production's supervisor; that node keeps one supervisor, which serves both as two callers, so the uid and the role's files are unchanged and the node-wide sweep and cap are an accepted non-production residual. Slice 3.8 adds the staging caller name to the closed list, a policy row per environment and the role's assertion. Staging's admission list is owned by its overlay and its supervisor rule names no caller image, so a merged pin deploys the WBS backend with no command; only a new solver image needs `solver.yml`. The claim that a separate node would not help is withdrawn: it is true of the policy and the caller name and false of the host half |
| S2-2 the runner restriction was insufficient                                                             | Fixed: the runner group limited to the workflow file at `refs/heads/main` and a job-started hook with an allow-list are preconditions of A11 with receipts; a manual run counts only at `main`; the App is never installed on this repository; the three credentials, their user and mode are stated; A11 has negatives for a same-repository branch pull request and a non-main run. The sentence about the existing runner is corrected: it is already restricted that way. Not as the review asked: the plan does not claim that gate code cannot read the credentials. The gate user is in the `docker` group, which the role calls root-equivalent; the plan bounds the credentials' scope to staging and asks the owner (open question 3 of that draft; R35 since the seventh)           |
| S2-3 rule (a) narrower than the design                                                                   | Fixed: an allow-list of each project's own namespaces, with negatives for `argocd` and the store's namespace                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| S3-1 AppProject `roles` and `syncWindows`; name collisions                                               | Fixed: rule (l)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| S3-2 nobody can delete a staging or production Application                                               | Fixed: the removal mode takes a unit of any project; negative in 2.5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| S3-3 the credential requirement against the accepted risk                                                | Fixed: the requirement stands; the risk is removed; A18 needs a live refusal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| S3-4 guard 6 has no mechanical check                                                                     | Fixed: the restore is bound to the recorded SHA-256 with `sha256sum --check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| S3-5 backup table: website alert, four databases, `wbs-mcp`, an undefined rule                           | Fixed: the website row says its alert ends too; the two other databases and the configuration archive are named and not carried, with the owner's word needed in A22; `wbs-mcp` is stated as not carried; the rule is 2.4(n)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| S3-6 stage-0 receipt and 1.3; task 0.1 and decision 10; orders 8 to 12 at A14                            | Fixed in decision 6, task 0.1 and A14                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| S3-7 staging configuration can name production Services                                                  | Fixed: rule (k) and slice 3.5's negative                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| S3-8 a build queues behind a gate                                                                        | Stated in decision 9 and under Risks; asked of the pool owner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Disputed in part: S2-2's request to state that gate jobs cannot read the build credentials. It
would be false on a host where the gate user is root-equivalent.

## Seventh review (at `498a532eb`) and what became of its findings

The review returned "not ready" with no finding of the first rank and three of the second.
This revision, the seventh draft, answers it. It also carries one scoping decision of the
planning session, R34, which the owner may overrule: dev's delivery leaves this change.

What moved:

- **Assumptions.** New: R34 (dev by a follow-up change) and R35 (the CI host is one trust
  zone). Reworded: R29, R31, R32, R33. R1 to R35.
- **Slices.** The sixth draft's 3.9 (the dev environment) is removed. New: 2.10 (containment
  at admission). Rewritten: 3.7 and 3.8. Still 23 slices.
- **Attended steps.** A11 is release builds only. The staging build runner is a new step, A23,
  in stage 4 after A18; it is numbered last so that A12 to A22 keep their ids. 23 steps.
- **Projects.** `root`, `platform`, `staging`, `production`; the sixth draft's `dev` project is
  gone. Rules still run (a) to (n).
- **Questions.** Two remain. The sixth draft's question 3 is closed into R35.
- **Dates.** Earlier drafts dated the owner's later decisions and several readings 2026-11-23.
  That was an error of the planning session: they were made and read on 2026-11-21, as the
  commits show. Every such date is corrected.

| Finding                                                                         | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 a staging rule with no caller image is refused by the program              | Fixed: slice 3.8 names the decoder change in `solver-supervisor-image-map.ts`: a null caller image is accepted for the staging caller alone; production's refusal, its test and its `Proof:` comment stay, and new negatives stand beside them. The claim that the rule format already allowed it is corrected in design decision 1 and in the reading below. The fallback that had the build job write the lists is dropped; the slice now stops and reports                                                                                                                                                                                                                               |
| S2-2 dev isolation rests on rules that never see what dev applies               | Reshaped. Dev's delivery leaves this change for a follow-up, proposed name `add-dev-environment` (R34): slice 3.9, the `dev` project, its account and the `override` grant are removed. What must hold whatever a ref contains is added now, as slice 2.10: admission policies for placement and for hosts (Ingress, `IngressRoute`, `IngressRouteTCP`, Certificate), a quota and a default-deny from the `policy` unit, and a kind whitelist on the staging project. No dev namespace is admitted to the solver's host directory, which keeps the socket out of reach of branch code until the follow-up. A NetworkPolicy's peers are not bounded at admission; that is stated, not solved |
| S2-3 "scope is staging" does not hold                                           | Fixed as the review proposed. The App is installed on a new staging pins repository alone, never on this repository or the fleet repository. The runner is persistent. That the gate user is root-equivalent, and that the integrity of images built on the CI host is the accepted blast radius, is R35, with what would shrink it. Promotion and what a person checks first are stated. How a kustomize overlay reads pins from a second repository is not settled and is listed so                                                                                                                                                                                                       |
| S3 rule (a) against platform units that write into app namespaces               | Fixed: `namespaces`, `policy` and `secret-sync` are named exceptions, in the rule and in a scenario                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| S3 the `override` contradiction                                                 | Gone with dev's delivery                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| S3 no dev units in the order table; "three AppProjects"                         | Gone with dev's delivery: the root's path holds three projects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| S3 `CONTEXT.md` lists four roles                                                | Fixed: five                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| S3 dates                                                                        | Fixed, see above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| S3 a stale question number and a dangling word                                  | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| S3 the cap is a literal, not inventory                                          | Fixed: `maxManagedContainers: 4` in the role's tasks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| S3 A11's runner part needs stage-4 inputs; its hook negative cannot be observed | Fixed: the runner is A23, after A18; the hook is run by hand with a foreign and an allowed workflow reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| S3 where host Docker pulls the solver image from                                | Stated in design decision 9 and as a precondition of A17's solver step. Which registry the reference names is not in the source read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| S3 the dev budget row counts backup jobs                                        | Fixed: 2,944; the sum is 8,832 and the margin 5,106                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| S3 the lint should allow-list triggers                                          | Fixed: slice 3.7 and the spec scenario                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

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
| `Prune=false` and `Delete=false` are per-resource sync options; Helm's `helm.sh/resource-policy: keep` is treated as `Delete=false` only                                    | `docs/user-guide/sync-options.md`, `docs/user-guide/helm.md` at tag `v3.6.2`             |
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
| `sync` and `override` are separate actions; a revision other than the Application's needs `override` when `application.sync.requireOverridePrivilegeForRevisionSync` is set | `docs/operator-manual/rbac.md` at tag `v3.6.2`, read 2026-11-21                          |
| The CLI's `--core` flag talks to Kubernetes directly, not to the API server                                                                                                 | `docs/user-guide/commands/argocd.md` at the tag                                          |
| Automated prune refuses a source with no resources unless `allowEmpty` is set; `automated.enabled: false` switches automation off                                           | `docs/user-guide/auto_sync.md` at the tag                                                |
| Rollback is authorised by `sync` unless `server.rbac.rollback.enforce.enable: 'true'` is set in `argocd-cm`; it cannot run while auto-sync is on                            | `docs/operator-manual/rbac.md` at tag `v3.6.2`, "The `rollback` action", read 2026-11-21 |
| `argocd_app_info` carries `sync_status` and `health_status`                                                                                                                 | `docs/operator-manual/metrics.md` at the tag                                             |
| A second source referenced by `ref` is described for Helm value files, with the `$values` path prefix; nothing is said there for kustomize                                  | `docs/user-guide/multiple_sources.md` at tag `v3.6.2`                                    |

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

## PostgreSQL hosting added (eighth draft)

Added on 2026-11-21 at the owner's request, after the seventh review's fold. No review has
read it.

- **Assumptions.** New: R36 to R42. Nothing was renumbered. R33 is decided for staging, on
  the owner's answer; its dev half stays assumed and belongs to the dev follow-up. R2, R3 and
  the roles table name the database server. R35's alternative says "one more server".
- **Decisions.** New decision 11, PostgreSQL hosting. A third decision record. Decisions 1,
  2, 3, 4, 5, 6, 7, 9 and 10 each gained the rows that concern the database.
- **Order.** New rows at orders 18 to 20: `cnpg-operator`, `barman-plugin`,
  `nonproduction-db`, `platform-db`. No existing row moved.
- **Stages.** New stage 6, database. Stages 0 to 5 are unchanged and none needs it.
- **Slices.** New phase 4, slices 4.1 to 4.5. 28 slices. The attended steps' heading is now
  section 5 of tasks.md.
- **Rules.** The `delivery` family gains rule (o), added by slice 4.3. Rule (n)'s exemption
  table gains the claims the operator makes for a cluster.
- **Attended steps.** New: A24 to A28. 28 steps.
- **Questions.** The question on R33 is closed. Open question 2 is now when to create the
  database server; open question 3 is Harbor's database. Three remain.
- **Not carried over from the brief.** Delivery by Flux; the interim scrape into Victoria;
  the Grafana dashboard, since the Prometheus stack here runs without Grafana; the
  `enablePodMonitor` field, deprecated at the pinned version; `platform-db` as the home of
  staging data; the port of WBS as part of this work; prices.

## Eighth review (at `44ad4a908`) and what became of its findings

The review, the first to read the PostgreSQL part, returned "not ready" with no finding of
the first rank and three of the second. This revision, the ninth draft, answers it and
records two owner inputs of 2026-11-21: the database server has 16 GiB, and the Slack
webhook exists. Two more arrived while it was written and are in it: a host for OpenClaw
(R43) and, on 2026-11-22, a remote workstation for the owner's agent sessions (R44).

What moved:

- **Assumptions.** Reworded: R2, R20, R31, R32, R35, R37 (decided at 8 vCPUs and 16 GiB),
  R39, R40. New: R43 and R44. Nothing was renumbered: R1 to R44.
- **Roles.** Eight: `agents` and `workstation` are hosts outside the cluster and the gate
  pool. New slice 1.6 and steps A29 and A30, outside the stages. Follow-ups named:
  `host-openclaw` and, at most, `set-up-operator-workstation`.
- **Staging path.** The build renders the staging manifests and commits them to the pins
  repository, and a staging Application's source is that directory. The two candidates of
  the eighth draft for reading pins from a second repository are gone.
- **Order.** No row moved. The four app units and the two database units now need `policy`.
- **Steps.** A23 keeps its number and moves before A18's WBS part, which waits for its
  receipt or the owner's waiver; so does A22. A26 follows A17. 30 steps with A29 and A30.
- **Slices.** 3.7 gained the render-and-commit step and is due before A23. 2.10 gained the
  host list's place, the solver pod and the host-less route. 4.2 makes `cnpg-operator` a
  kustomize unit. 4.5 dumps both clusters and reclaims the drill's volume. 29 slices with 1.6.
- **Storage.** No separate WAL claim; the throwaway cluster of a drill uses the packaged
  `local-path` class.
- **Questions.** The webhook question is closed. Four remain: when to create the database
  server; Harbor's database; the agents host's region and OpenClaw's state; the
  workstation's region and size.
- **Cut.** The "how an overlay reads its pins" paragraph and its two risks; the 8 GiB
  budget, its 512 MiB trigger and the tight-margin risk; the WAL claims and their disk
  arithmetic; the "delivery unproven" branch of A14.

| Finding                                                                        | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 staging does not follow `main` for code, and the plan can finish that way | Fixed with the review's design: the staging build commits rendered manifests to the pins repository and the staging Application reads that directory (design decisions 3 and 9, slice 3.7). The App pushes to `main` there as the only bypass actor of the pull-request ruleset; a second ruleset without bypass refuses forced and deleting pushes. A23's receipt, or the owner's dated waiver, is a precondition of A18's WBS part and of A22. The gap and its closure are in the proposal, the second decision record, decision 10 and Risks. The website keeps its present path until its owner chooses, which is not a regression: its dev copy does not follow `main` today |
| S2-2 the placement policy denies cert-manager's HTTP-01 solver pods            | Fixed: every ACME issuer carries one solver per environment whose pod template selects that environment's capability, in the `issuers` unit and required of the fleet repository's issuers; an allow from Traefik to solver pods; a k3d case and a rehearsal item; rule 2.4(f) reads the issuers. Nothing is exempt from the policy. Other controllers were checked: CloudNativePG places a cluster's pods by its `affinity`; hook Jobs are in the tree; the External Secrets Operator, ECK and Velero make no pod in an app namespace                                                                                                                                            |
| S2-3 the restore drill leaks production data onto the node's disk              | Fixed: a throwaway cluster uses the packaged `local-path` class, whose policy is `Delete`; the drill fails if a Released volume or a directory is left; rule (o) refuses a throwaway cluster on a retaining class; A28 stops when the disk does not return. What local-path does not isolate is stated, the separate WAL claim is dropped, and what bounds disk use is in decision 11. A bounded filesystem was weighed and not taken, with the reason                                                                                                                                                                                                                            |
| S3 database taint wording                                                      | Fixed: pods of the `platform-db` unit and the three node agents, in design, spec and rule (o)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| S3 A26 order                                                                   | Fixed: after A17 and slice 2.10                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| S3 slice 2.10's mechanism and gaps                                             | Fixed: `ValidatingAdmissionPolicy` is named; the host lists are one ConfigMap in a platform namespace; a route with no host, a wildcard or a pattern is denied; the app units need `policy`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| S3 the pin credential admits a backend to the solver socket                    | Stated in decision 1, in R35 and in the credentials paragraph of decision 9                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| S3 how the App lands a pin                                                     | Stated: decision 9 and task 0.6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| S3 CloudNativePG CRDs could be pruned                                          | Fixed: the operator unit patches every CRD with `Prune=false,Delete=false`; rule (o) and a scenario hold it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| S3 memory margin under the plan's own trigger                                  | Gone: the owner set the server at 16 GiB. A `delivery` negative now holds the three schedules apart                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| S3 `nonproduction-db`                                                          | Fixed: its own bucket and key, a nightly dump as its owner roles, one restore in A26 before the tracker's port, egress allowances in its unit, and a fault for the WAL alert that can fail (the unit's egress policy removed by hand)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| S3 stale items                                                                 | Fixed: three decision records in task 0.2; R38 to R41 in both files; `database` in the capabilities requirement; the webhook wording; the Velero schedule, which does copy volumes by file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Nothing was disputed in this round.

## Ninth review (at `5c54a1707`), what became of its findings, and the split

The review returned "not ready" with no finding of the first rank and five of the second,
each a small text fix, and recommended splitting the change. This revision, the tenth draft,
answers it and splits the plan in three.

**The split** is the planning session's scoping, made on 2026-11-22 on the reviewer's
recommendation; the owner asked for one plan and may overrule it. This change keeps the
cluster rebuild, stages 0 to 5. Two changes are stacked on it and are, with it, the new setup
plan:

| Change            | Holds                                                                                        | Ids of the ninth draft, and what they became there                                                      |
| ----------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `host-postgres`   | decision 11, the database role and node, the operator, both clusters, backups, drill, alerts | R36 to R42 became PG1 to PG7; slices 4.1 to 4.5 became PG-S1 to PG-S5; A24 to A28 became PG-A1 to PG-A5 |
| `add-agent-hosts` | the agents host and the workstation                                                          | R43 and R44 became AH1 and AH2; slice 1.6 became AH-S1; A29 and A30 became AH-A1 and AH-A2              |

Here: assumptions are R1 to R35, with R14 and R18 withdrawn as before; slices are 1.1 to 1.5,
2.1 to 2.10 and 3.1 to 3.8, 23 in all; attended steps are A1 to A23; the `delivery` rules run
(a) to (n), rule (o) having gone with `host-postgres`; the order table ends at order 17; the
attended steps are section 4 of tasks.md; decisions are 1 to 10; two decision records remain.
The roles table still names the three roles the other changes define. Text was moved, not
rewritten, except where the split needed a sentence to change. Where an older section of
this record names R36 to R44, slices 4.1 to 4.5 or 1.6, A24 to A30, decision 11 or rule (o),
it means the ninth draft's ids in the table above.

| Finding                                                             | What became of it                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 Argo CD has no read credential for the private pins repository | Fixed here: a read-only deploy key in decision 5's table, applied by a rerun of `argocd.yml` in A23, whose receipt reads it back and shows the repository connected                                                                                                                                                                           |
| S2-2 A18 starts WBS on an empty claim                               | Fixed here: the staging Application file is merged only after the pins directory's head, or for the website the fleet overlay, is the zero-replica render; A18 stops otherwise; a scenario holds it. The website and the request app were checked: their overlay and their Application file are two merges in two repositories, in that order |
| S2-3 A26's drill does not exist yet                                 | Fixed in `host-postgres`: a suspended drill CronJob in the non-production cluster's unit                                                                                                                                                                                                                                                      |
| S2-4 The App key's stated bound omits pod security                  | Fixed here: every staging and dev namespace enforces `restricted`, a solver namespace excepted, with a rule and negatives in slice 2.10; the sentence on where staging NetworkPolicies come from is corrected, and the residual, peers unbounded from pins, is stated with what bounds it                                                     |
| S2-5 The workstation's key check cannot be built as specified       | Fixed in `add-agent-hosts`                                                                                                                                                                                                                                                                                                                    |
| S3 Controller on h2puni                                             | Stated: decision 10 and Risks say that the new age identity and the admin key are then where gate code is root-equivalent, and that a workstation as the controller removes it                                                                                                                                                                |
| S3 "The one thing" before h1claw's deletion                         | Fixed: decision 10 names the second, OpenClaw's state, and whose question it is                                                                                                                                                                                                                                                               |
| S3 Render step                                                      | Fixed: the locked `kustomize`; a Secret object, an empty render and a failed one are refused, each with a negative; `allowEmpty` is refused by rule 2.4(b)                                                                                                                                                                                    |
| S3 Promotion re-renders production at `main`                        | A check, not a copy: `tool-fleet promotion-check` compares the commit staging ran with `main`. Copying the rendered form was not taken, because a staging render carries staging's namespaces, hosts and store paths                                                                                                                          |
| S3 Database: alert response, drill against the 80% alert, rule (o)  | In `host-postgres`                                                                                                                                                                                                                                                                                                                            |
| S3 R43's date                                                       | In `add-agent-hosts`: both host decisions are dated 2026-11-22                                                                                                                                                                                                                                                                                |
| S3 Decision 10 omits task 0.1                                       | Fixed                                                                                                                                                                                                                                                                                                                                         |
| S3 Slices without a requirement                                     | 2.6 has a requirement now. For 1.4, 1.5, 2.9, 3.3 and 3.4 decision 4 says why none is needed                                                                                                                                                                                                                                                  |
| Open point: Traefik on the host network and the solver allow        | The allow is an `ipBlock`, as `otlp-ingress.yaml` uses. Which source address a pod sees was not established; slice 2.10's k3d case reads it, and it is listed under "Not verified"                                                                                                                                                            |

Nothing was disputed in this round. The split changed nothing in substance here beyond what
this table lists.

## Minimal placement profile (eleventh draft) and one pull request

Added on 2026-11-22 at the owner's request (R45, R46). No review has read this draft.

**How it is expressed.** One design and two placement profiles, in design decision 11.
Workloads select capabilities; a profile is the mapping from capability to server in the
fleet's desired state and inventory. The minimal profile is the default of every step,
budget and receipt. The full profile is a column of decision 1's table and the growth steps
of decision 11. No slice or step is duplicated.

**Ids.** New here: R45 and R46 (R36 to R44 stay with the ninth draft's meaning), slice 1.7
and decision 11 (a new decision; the ninth draft's decision 11 is `host-postgres`). Slices
are now 24 and attended steps stay A1 to A23. A16 creates one server instead of two; A17
joins it and gives h7obs two capabilities; A12, A14 and A18 changed as their text states.
R2, R3, R29 and R30 were reworded; nothing was withdrawn.

**Rules that changed.**

| Rule as the tenth draft had it                                                  | Now                                                                                                                                                                  |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One node role per host                                                          | One trust class per host; two co-locations allowed in this change's scope (`nonproduction` and `ingress` with `observability`; `database` with the server); rule 1.2 |
| The server carries none of `product`, `nonproduction`, `ingress`                | The same, and none of `observability`                                                                                                                                |
| Only `platform-services` workloads and three agents tolerate the platform taint | Workloads that select `database` may too (change `host-postgres`)                                                                                                    |
| A node's capabilities are fixed when it joins                                   | A joined node's capability labels follow the inventory (slice 1.7), which A17 and every growth step use                                                              |

**Read in source for it.**

- `solver-supervisor-command.ts` and `solver-supervisor-lifecycle.ts`: the start-up sweep
  lists Docker containers with the label filter `wbs-managed-solver=true` and kills only
  those; pods under the k3s runtime are not in that list.
- `infra/ansible/roles/solver/tasks/main.yml`: the role installs the pinned `docker.io`
  package and asserts `product`; slice 3.8 already changes the assertion.
- `infra/ansible/roles/k3s_agent/templates/config.yaml.j2` and the server's: capability
  labels are `node-label` entries of the k3s configuration, and no playbook sets a label
  on a registered node (`grep` over `infra/ansible`).
- The k3s agent CLI page describes `--node-label` as "Registering and starting kubelet
  with set of labels". That a label added to the configuration later is not applied is
  believed and is slice 1.7's stop condition, not a reading.

**What the figures say against the trial size of the apps node.** On limits the production
workloads fill an 8 GiB node with nothing left for a solve (design decision 2). The owner
chose to try it; A19 and A20 measure, A19 stops before WBS is added, and the rescale has
triggers that are alerts as well.

**What the figures said against one co-location.** On the declared figures staging did not
fit beside the observability stack on 16 GiB: 972 MiB were left before the staging database
and any solve. Shown that, the owner chose a larger server (below); on 24 GiB the same rows
leave 5,442 MiB, or 2,498 with dev. A14's measurement stays the condition.

## Tenth review (2026-11-22)

A tenth review read the three changes at `cb5689194`: no S1, six S2, and an opinion on
where the restore drill runs. This draft is the eleventh. It has not been reviewed.

| Finding                                                                                      | What became of it                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 A17 cannot pass: `base` sets the unprivileged-port sysctl only if `ingress` is present  | Fixed: slice 1.7's play re-applies the capability-derived host settings before it sets labels, with a negative in the rehearsal; A17's receipt reads the sysctl                                                                                                                                          |
| S2-2 The restore drill is denied by the plan's own admission clause                          | Fixed in `host-postgres`: the capability `restore-drill` is withdrawn and a drill selects its cluster's capability. The reviewer's opinion was taken: nothing lands on the apps node; the drill is attended while the server carries the database                                                        |
| S2-3 Slice 1.7's guard is wrong both ways                                                    | Fixed: DaemonSet pods do not block a removal; a `Retain` volume bound to the node does, whatever the replica count. The non-production growth step stops the whole environment, deletes the old claims, moves the label and only then restores, so no claim can bind on the old node. Its cost is stated |
| S2-4 The PriorityClass protection is unwired                                                 | Fixed: the class is in slice 2.8 and on the pods from their first start; rule 2.4(p) and a requirement hold it; admission denies any `priorityClassName` in a non-production namespace (slice 2.10)                                                                                                      |
| S2-5 A false done-claim on an irreversible step                                              | Fixed in `add-agent-hosts`: the copy of 2026-11-21 is called a copy; AH-A3 requires task 0.5's read-back, which has not been done                                                                                                                                                                        |
| S2-6 Disk floors contradict the decided sizes                                                | Fixed: the 150 GiB readings are of servers rescaled without their disk. Design decision 2 gives every role a minimum disk as a requirement, checked by the step that creates the server, and says what a rescale does and does not do to a disk. The apps floor is 50 GiB now that no drill lands there  |
| S3 The owner's country in public text                                                        | Removed in the four places                                                                                                                                                                                                                                                                               |
| S3 A14 measures before MLflow and before any telemetry source                                | Fixed: the sum is written after A15, and again a day after A18 and after A20, against the same stop                                                                                                                                                                                                      |
| S3 A19 has no memory stop; A1 lacks its disk stop; no alert for low memory or memory kills   | Fixed: A19 stops under 1,024 MiB before WBS is added; A1 stops on the role's minimum disk, as every creating step does; two node rules in slice 2.8                                                                                                                                                      |
| S3 etcd metrics; the loop-backed claim shares the root journal; a static class and a replica | Slice 1.2 adds `etcd-expose-metrics`; Risks says the bound is on space and not on I/O; `host-postgres` counts on a restore for the database's move                                                                                                                                                       |
| S3 h7obs holds production logs and carried keys beside staging                               | Added to Risks with what bounds it                                                                                                                                                                                                                                                                       |
| S3 Workstation as controller against the shared host                                         | Fixed: the shared operator host may not be the controller (decision 10, Risks, `add-agent-hosts`)                                                                                                                                                                                                        |
| S3 `CONTEXT.md` lacks "trust class" and "placement profile"; "exactly one trust class"       | Added; the requirement names the one exception                                                                                                                                                                                                                                                           |
| S3 "A moved label and nothing more" overstates                                               | Fixed: decision 11 gives each growth step's cost                                                                                                                                                                                                                                                         |

New since the tenth draft, at the owner's word: the observability server is larger (R2), so
the "does not fit on paper" statement for staging is withdrawn for 24 GiB and kept for the
stack's limits; Harbor and the custom runner are confirmed as built (R10, R31); an
orchestrator in front of the pool is open question 1. New rule: 2.4(p). No id was
renumbered.

Checks rerun on this draft, 2026-11-22, the same way as the table under "Repository
checks": `openspec validate --strict` for each of the three changes (valid) and `--all`
(351 of 351); `prettier --check` on the three change directories and `CONTEXT.md`; the
three `tool-devsync` document tests (34 pass) and `tool-rename-work-package` (37 pass);
`check-indexes` (exit 0); the two hooks on the changed files (exit 0). Not run: `bun
install`, every Nx target, `check-documents-target`, any lab.

**One pull request.** The branches of `host-postgres` and `add-agent-hosts` were merged
into this change's branch on the owner's request, which the forge records as those two pull
requests merged into this branch; nothing of them is on `main`. The
sentences that called them stacked were removed or reworded; older sections of this record
that say "stacked" describe the tenth draft.

## CI orchestration moved to a fourth change (twelfth draft)

On 2026-11-22, after the eleventh draft, the owner chose an orchestrator for CI: first
Woodpecker CI with Dagger and without the host pool underneath, then, with multitenancy in
mind, Argo Workflows and Argo Events. The planning session wrote that as a fourth change,
`run-ci-on-argo-workflows`, in this pull request. Its verify.md records his words and what
was read. This draft is the twelfth. It has not been reviewed.

What changed here because of it:

| Eleventh draft                                                                       | Twelfth draft                                                                                              |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| R12, R31, R35: one executor, the host pool, on a CI host outside any cluster         | restated: a CI cluster on the CI server, the scheduler as admission, the cluster as one trust zone         |
| Decision 9: a self-hosted GitHub Actions runner, runner group, hook and lint         | removed; the trigger, the executor and the credentials' place are the CI change's                          |
| Slice 3.7: workflow, hook, lint, render step, promotion check                        | the render step and the promotion check stay; the rest is the CI change's slices CI-S4 and CI-S7           |
| Slice 3.3: rewrite the gate documents after A10                                      | the rewrite is CI-S8; removing the old hosts from them stays                                               |
| A9: create the CI host and apply the gate-host role                                  | create the CI server; no gate-host role                                                                    |
| A10: enroll and calibrate, by the pool's owner                                       | replaced by CI-A1 to CI-A4; the id is kept and its receipt means CI-A4's                                   |
| A23: runner, group, hook, App, read key                                              | two parts: the pins repository, App and read key; then CI-A5's first automatic build                       |
| Stage 2's receipt: a gate exits 0 and its calibration is recorded                    | a full gate exits 0 through a Workflow on the CI cluster, on a commit that also passed on an old gate host |
| Guard 5 and the requirement "Gates do not stop": the new CI host is calibrated       | a full gate has passed on the CI cluster                                                                   |
| Open question 1: an orchestrator in front of the host pool                           | answered; the CI server's size is the CI change's open question 1                                          |
| The spec requirement "One executor on the CI host, and no build from a pull request" | "The staging build writes the pins repository only"; the trigger's rules are in `ci-orchestration`         |

A finding for the owner from that change: on its figures one gate does not fit a 16 GiB CI
server beside the cluster's own pods, so it asks for 12 vCPUs and 24 GiB.

## cert-manager behaviour

Read on 2026-11-21 in the `ClusterIssuer` CRD of the locked chart archive
`infra/platform/charts/cert-manager-v1.21.2.tgz`. Nothing was run.

| Relied on                                                                                            | Where it was read                                                             |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| An HTTP-01 ingress solver takes `podTemplate.spec` with `nodeSelector`, `tolerations` and `affinity` | the CRD's schema for `spec.acme.solvers[].http01.ingress`                     |
| A solver is chosen by `selector.dnsNames`, `dnsZones` or `matchLabels`                               | the same schema; the staging issuer in the tree already selects by `dnsNames` |

Not established: that the solver pod is created in the Certificate's namespace for a
`ClusterIssuer` (believed), and the label its pods carry, which the Traefik allow of slice
2.10 names; both are read on k3d there.

## Failure proofs

No check exists yet, so there is nothing to break. Each slice that adds a check names the fault
it must inject. This table is filled as slices land.

| Safety boundary | Injected fault and observing test | Observed proof |
| --------------- | --------------------------------- | -------------- |
| none yet        |                                   |                |

## Owner decisions

This record keeps the ninth draft's ids: R36 to R44 are now PG1 to PG7 of `host-postgres` and
AH1 and AH2 of `add-agent-hosts`, which repeat the quotes that concern them.

The first decisions of 2026-11-21 are recorded above under "Replaced drafts". Later the same
day, in his words where they carry the decision:

- "I'd like to setup openbao before other stuff" (R22).
- "i want the main to act like staging ...; so what merges to main - gets deployed on
  staging; however prod deployment is done by hand/on command" (R20).
- MLflow is kept (R15).
- h1claw: the owner said it may be deleted at any time (a paraphrase by the planning
  session). The consequences in R30 were stated to him then and confirmed later the same day,
  below.
- Alerts go to the Slack channel `#puni-alerts-dev`.
- Staging images: he leaned to building on the CI host and asked how CI is triggered; decided
  later the same day, below.
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

After the fifth and sixth reviews, still on 2026-11-21:

- Backup windows: asked to choose between accepting the gap after h1claw's deletion and
  keeping h1claw until WBS has moved, he answered "backup - ok" (R30). This replaces the two
  bullets above that call R30 unconfirmed.
- The Slack webhook: "webhook - ok", meaning it comes later.
- "let's keep the custom runner that can be triggered either by github actions or by agents
  through cli/mcp/call to 'wbs' api (it will all converge to puni-user-platform)" (R31). He
  had asked about Argo Workflows and did not take it.
- "let's do dev & staging on a sep node" (R29), after the sixth review's finding on the solver
  supervisor. It replaces "staging on the apps node" above.
- "yeah - staging and dev must be separate envs" (R29). What each is for he has not said; R33
  is the planning session's reading and awaits him.

After the seventh review, still on 2026-11-21:

- Asked whether staging is automatic from `main`, holds the agents' tracker and promotes to
  production: "ok for all three" (R33, for staging).
- He said to go ahead with the escrow of task 0.5. Outside this plan, on 2026-11-21, a copy of
  the secret files that live on h1claw, the backup archive key and the object storage
  credentials among them, was taken to an owner-only place off that host: 10 files, and 10
  of 10 SHA-256 checksums matched their source. No value, path or file name is recorded here.
  This is not task 0.5's receipt: the read-back on a second machine against the escrow
  entries is still to do, and so is moving the values the new cluster needs into OpenBao
  once it exists (A7, A14, A15).
- "i'll also need you to include hosting postgres in the plan", with a brief from another
  session; then "this session supersedes the decisions from brief" (R36).
- On who uses it: "i want everybody to use it once it's in place" (R36). Earlier the same day
  he had said "I want to use SQLite for as long as possible".
- On the database server: "just plan for it for now, i'll evaluate the options" (R37).

After the eighth review, still on 2026-11-21:

- "let's do db node at 16GiB" (R37, R2), after he was told the 8 GiB budget left about 240
  MiB at its peak.
- The Slack webhook of `#puni-alerts-dev` exists and he holds it outside this repository.
  It is written into OpenBao in A14. No address, path or file name is recorded here.
- On 2026-11-22: "let's also add a host for openclaw to this mix" (R43, now AH1 of the
  change `add-agent-hosts`). Measured on h1claw on 2026-11-21,
  read-only: 4 vCPUs; 7.75 GiB of memory, 3.2 GiB available; the OpenClaw gateway at about
  2 GiB resident; a 75 GB disk at 91%, about 21 GiB of it OpenClaw's state; user-level
  systemd units outside any cluster; Tailscale for private access; agent sessions with
  credentials of their own; a provider region other than the cluster's.

On 2026-11-22:

- "and a sep host for logged in agent's accounts that i'll access through herdr" (R44).
  Measured on the operator's laptop that day: 29 agent processes at 3.3 GiB resident; 21
  of 30 GiB of memory in use; a 460 GB disk full; 24 cores. `herdr` was read from its
  help output only, at version 0.9.5: an SSH remote mode and saved SSH machines.

- "let's work on the alt version where we ONLY segregate the nodes that will be hard to
  horizontally scale in the future and we're more conservative with resources spend; i want
  to see what is the minimal setup i can do that will scale later" (R45). Offered three
  choices, he answered: OpenClaw and the workstation "two hosts"; "CI let's start at" the
  8 vCPU and 16 GiB class; staging and dev "ok to keep on the obs node".
- "prod apps on 8GiB - yeah we can try": the production apps node is 4 vCPUs and 8 GiB in
  the minimal profile, as a trial (R2).
- Because of power cuts where he works he needs a remote workstation, and said he "can
  have just one for openclaw + workers": one host for OpenClaw and his own sessions in the minimal profile,
  replacing his "two hosts" of earlier that day (change `add-agent-hosts`).
- "i want all new infra, all old nodes can be retired" (R46), after the planning session
  had offered to keep h1claw and h2puni.
- "can you merge all plans into one PR?": the three changes are in one pull request and
  stay three change directories.
- "i want to keep both harbor and custom ci runner; if i have those operating normally, i
  can have them replaced with cheaper options; and once i have them built i'm sure that i
  have a plan to grow that will work; we're keeping them" (R10, R31), after the planning
  session had listed a hosted registry and hosted runners as ways to defer both.
- He asked for a self-hosted tool that orchestrates CI "so that i don't need to build
  one" and named Dagger; the planning session answered that Dagger defines a job and does
  not trigger or queue one, and named Woodpecker CI for that part. Nothing was decided
  (open question 1).
- "ok let's go for bigger obs server & shared operator 16GiB", after the tenth draft showed
  that staging did not fit beside the stack on 16 GiB on paper: the observability server
  is larger than that class (R2: at least 24 GiB recorded, 12 vCPUs and 24 GiB assumed,
  since he named no size), and the shared operator host is 8 vCPUs and 16 GiB (change
  `add-agent-hosts`).

Not the owner's: R34, that dev is delivered by a follow-up change, is the planning session's
scoping after the seventh review, and R35 is its statement of what the CI host is trusted
with. He has seen neither yet. R38 to R42 are the planning session's too: the operator, the
layout, where staging's databases run, the recovery targets, and that Harbor keeps its own
database. He was told of the last and did not object.

On 2026-11-22, after the eleventh draft: an orchestrator for CI that he does not have to
build, Argo Workflows and Argo Events with Dagger, without the host pool underneath, and
multitenant; his words are in the verify.md of `run-ci-on-argo-workflows`. R31 is restated
on them; R12 and R35 are the planning session's restatements.

Overrules of R1 to R35, R45 and R46 beyond these: none yet (task 0.1).

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
| `/dev/kvm` on the operator's laptop               | present; the laptop's disk was full, so no lab ran                                                                                                                   |
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
| Members of h1claw's hourly set                    | five per stamp, all pulled from h2puni: WBS production, WBS dev, `aivn-dev`, `aivn-cms-dev` and a configuration archive                                              |

Read for the sixth draft, in source at the same commit:

| Reading                                                             | Result                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `solver-supervisor-image-map.ts`                                    | the caller list is closed: `be-01-blue`, `be-01-green`, `wbs-dev-src`, `k8s_wbs-solver_backend`. A rule's caller image may be null for `wbs-dev-src` only; for every other caller the decoder throws, under a `Proof:` comment (lines 55 to 61, read again for the seventh draft; the sixth draft misread this) |
| `solver-supervisor-image-map.test.ts`                               | a null caller image for `k8s_wbs-solver_backend` must throw                                                                                                                                                                                                                                                     |
| `roles/solver/tasks/main.yml`                                       | `maxManagedContainers: 4` is a literal; each mapped solver image is pulled by digest with the host's Docker, with no login and no CA step                                                                                                                                                                       |
| `solver-supervisor-docker-output.ts`                                | a pod's caller name is `k8s_<namespace>_<container>`                                                                                                                                                                                                                                                            |
| `solver-supervisor-lifecycle.ts`                                    | the start-up sweep kills every managed container on the node; the cap counts them node-wide                                                                                                                                                                                                                     |
| `solver-supervisor-config.ts`                                       | a solver container's memory limit is at most 512 MiB                                                                                                                                                                                                                                                            |
| `roles/solver`                                                      | asserts `product`; one uid (10001, the backend pod's), one sudoers entry, one tmpfiles link to `/run/puni/solver`                                                                                                                                                                                               |
| `roles/gate_host/tasks/main.yml`                                    | the gate user is added to the `docker` group, which the role's comment calls root-equivalent on the host                                                                                                                                                                                                        |
| `docs/infra/deployment.md`, `infra/ci/deploy-runner/job-started.sh` | the `puni-deploy` runner is to sit in a group limited to `deploy-k3s.yml@refs/heads/main`, and its hook fails any other workflow reference                                                                                                                                                                      |
| `infra/jobs/catalogue.json`                                         | `gate`, `release-build`, `test-queued`, `solver-image-publish`                                                                                                                                                                                                                                                  |
| `docs/infra/gate-hosts.md`                                          | a gate reserves the whole pool and may not be listed in `concurrencyEligible`                                                                                                                                                                                                                                   |

## Repository checks

Dependencies were not installed in the worktree: the laptop's disk was full. The binaries of the
main checkout were used through a temporary `node_modules` link, removed afterwards. The rows
below were run again on this revision, on 2026-11-22.

| Command                                                                                                     | Result                                                                    |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `openspec validate <change> --strict`, for each of the four changes                                         | each `Change '<change>' is valid`, exit 0                                 |
| `openspec validate --all --json`                                                                            | 352 items, 352 passed, 0 failed                                           |
| `prettier --check` on the changed plan files of the four changes                                            | `All matched files use Prettier code style!`                              |
| `env -u CLAUDECODE bun test` on `adr-index`, `repo-namespacing-handoff`, `current-documents` (tool-devsync) | 34 pass, 0 fail, 109 assertions, 3 files. Changed files were staged first |
| `env -u CLAUDECODE bun test tools/tool-rename-work-package`                                                 | 37 pass, 0 fail, 89 assertions, 4 files                                   |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                 | exit 0, empty stderr                                                      |
| `plaintext-secrets.ts` and `private-nesting.ts` on the five plan files (`tools/tool-git-hooks/src/hooks`)   | each exit 0                                                               |
| Intent word count of proposal.md, "Why" to "Constraints"                                                    | 395 words here; 361, 339 and 334 in the other three                       |

## Checks not run

- `bun install --frozen-lockfile` and every Nx target, `tool-devsync:check:docs` included: no
  disk space. CI runs them.
- `check-documents-target.test.ts`: each run leaves about 2.8 GB under `/tmp`.
- No lab, VM, cluster or Argo CD rehearsal: slice 2.7 owns that.
- No playbook was run. What the playbooks do was read from their sources and from the runbooks'
  records of earlier runs.
- This revision has not been reviewed. The ten reviews recorded above read earlier commits.

## Primary sources read

- For the ninth draft: the `ClusterIssuer` CRD in the locked cert-manager archive;
  `registry/production/issuers.yaml` again; the Argo CD sync-options and Helm guides and the
  CloudNativePG scheduling and storage pages at their tags; the Velero schedule's volume
  setting; the storage classes.
- For the eighth draft: the CloudNativePG and Barman Cloud plugin pages listed under
  "CloudNativePG behaviour"; the `k3s_agent` configuration template; the storage classes;
  the Velero schedules; the Prometheus stack's selectors and its Grafana setting.
- For the seventh draft: `solver-supervisor-image-map.ts` and its test, the `solver` role's
  tasks again, and the Argo CD multiple-sources guide at tag `v3.6.2`.
- For the sixth draft: the five supervisor sources and the `solver` and `gate_host` roles named
  under "Read-only readings"; `docs/infra/deployment.md` on the deploy runner and its hook;
  `docs/infra/recovery.md` on the h1claw sets.
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
- For the fourth review and the decisions of 2026-11-21: the design file of pull request #935
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

## The pass of 2026-11-22 for private access, tenancy and close-out

The owner was away and had set the goal "finalize the plans for the new infra move; push and
merge the plan". This pass applies two decisions of his and settles what was left open, so
that nothing blocks stage 0 or the merge.

**His words, recorded.**

- "let's make the plan account for (1) all that must be 'orchestratable' by the puni user
  platform, must be multitenant (2) i'll use tailscale for access" (R47, R48).
- "i want to use tailscale to safely access the services that run the platform without
  exposing them to the internet" (R47).

**Set for him by the planning session, for him to overrule by id.**

| Id        | What                                                              | Why it was not left open                                                 |
| --------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| R49       | break-glass is the provider's console; no public SSH rule         | a rule had to be chosen for the firewall slice                           |
| R50, CI13 | the CI server is 12 vCPUs and 24 GiB                              | it blocked A9 and CI-A1                                                  |
| R51, CI11 | no public webhook; a trigger job joins the private access network | recommended to him on 2026-11-22 and unanswered; it is what R47 asks for |
| R52       | Tailnet Lock on, key expiry off for servers, login by `sshd`      | the join and the trigger depend on it                                    |
| CI12      | a result is written to GitHub as a commit status                  | it was the CI change's second open question                              |

**New in this change.** Decisions 12 and 13; a third decision record; assumptions R47 to
R52; task 0.7; slice 1.8; rules 2.4(q) and (r); the unit `tailscale-operator` at order 2;
step A24; three requirements. Slices are now 25 and attended steps A1 to A24. R17 has no
jump host any more; R2, R23, R31 and R45 are reworded. The risk "losing the platform node
loses the jump" is replaced.

**Read in Tailscale's documentation on 2026-11-22.**

| Read                                                                                                                                                                                                      | Page                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| A device that is tagged when it first authenticates has key expiry disabled by default                                                                                                                    | "Tags"                                            |
| Tailnet Lock: a new device needs a signature from a trusted device, so the coordination service alone cannot add one; an auth key can be signed beforehand; disabling the lock needs a disablement secret | "Tailnet Lock"                                    |
| With Tailscale SSH on, Tailscale takes port 22 for connections that arrive from the tailnet; it is not enabled here, so `sshd` and its keys decide a login                                                | "Tailscale SSH"                                   |
| The Kubernetes operator exposes cluster workloads to the tailnet and the Kubernetes control plane over it, without a public endpoint                                                                      | "Tailscale Kubernetes Operator"                   |
| The API server proxy's `auth` mode impersonates a user as the Tailscale user and a tagged device as its name with its tags as Kubernetes groups; grants may add groups                                    | "Access the Kubernetes API server over Tailscale" |
| Enabling certificates publishes machine names and the tailnet's DNS name on a public ledger                                                                                                               | "Enabling HTTPS"                                  |
| Sharing gives a recipient outside the tailnet one device and nothing else                                                                                                                                 | "Share your machines with other users"            |
| Funnel proxies a device's resource from the internet through the vendor's relays                                                                                                                          | "Tailscale Funnel"                                |
| The policy file can be managed from a Git repository, validated and applied automatically                                                                                                                 | "GitOps for Tailscale"                            |
| OAuth clients with the `auth_keys` scope are limited to chosen tags; an auth key expires after at most 90 days                                                                                            | "OAuth clients", "Auth keys"                      |
| The vendor's GitHub Action creates an ephemeral, tagged device per job                                                                                                                                    | "Tailscale GitHub Action"                         |

**Not verified.** The package version to lock, which slice 1.8 records. Tailscale's UDP port
for direct connections, from memory. Whether the policy file's own `tests` section covers
what the repository's test asserts. The operator's chart values for the API server proxy
and for exposing a Service by Ingress. How a k3s server's certificate takes a tailnet name
beside its private address. That a provider's console gives a login when the network path
is closed, which A24 tests. Prices: the vendor charges per user, and no plan was checked.

**Tenancy read in source.** `infra/platform/policy/namespaces.yaml` carries Pod Security
labels and `puni.dev/trusted-hostpath`, and no tenant label; `CONTEXT.md` has no term
"tenant" and lists it as a word to avoid for an organization, so no term is added: decision
13 uses the word in its plain sense, for the unit a platform service isolates.

**Open items, and why none blocks.** Core: none. `host-postgres`: when `platform-db`
starts and when it gets a server wait for PG-A4 and PG-A1; Harbor's database is assumed
(PG7). `add-agent-hosts`: the host's region waits for AH-A1, and OpenClaw's state for
AH-A3. `run-ci-on-argo-workflows`: none; the tenant's repository list waits for CI-A3.

**Checks on this pass** are listed with the commit in the pull request's body.
