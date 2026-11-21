Agent slices (phases 1 to 4) change source and run tests; none touches a host. Attended steps
(A1 to A28) each name who runs them, the command, the receipt, the stop condition and the
rollback. Assumption and decision numbers refer to [design.md](design.md). Every slice that
adds a safety check lands it with a production-path negative, watched failing with the check
removed, and an adjacent `Proof:` comment. Nothing here has been done yet.

`fleet_ansible` is the controller wrapper of
[enroll h4claw and h3mon](../../../docs/infra/enroll-h4claw-h3mon.md#1-prepare-the-controller-on-h2puni),
extended by slice 2.5 and run against the new inventory of slice 1.3, always with `--limit`:
an unlimited play also targets the CI host, which is not a k3s node. `$OPS` is its owner-only
input directory. "Sync" of a platform unit means
`fleet_ansible --limit h5plat --extra-vars puni_sync_units=<units> playbooks/argocd-sync.yml`
(design decision 3).

## 0. Decisions

- [ ] 0.1 Owner reads assumptions R1 to R42 and the three open questions in design.md and
      overrules by id. He may overrule R34 (dev is delivered by a follow-up change), R35
      (the CI host is one trust zone) and R38 to R42 (the shape of the PostgreSQL service,
      its recovery targets, and Harbor's database). Rows marked decided record his answers
      of 2026-11-21. Receipt: the
      overrules, dated and quoted, in verify.md. Until then only slices 1.1, 1.2 and 2.1 to
      2.5 may start; the rehearsal 2.7 needs 2.1 to 2.5 and follows them.
- [ ] 0.2 File the two decision records from design.md as ADRs under the next free numbers
      once pull requests #935 and #948 and the Harbor record have settled theirs, link them
      from proposal.md, and delete the quoted copies. Test:
      `env -u CLAUDECODE bun test tools/tool-devsync/src/adr-index.test.ts`.
- [ ] 0.3 After 0.1: the Harbor change's owner adds a dated pointer to this change in its
      `proposal.md` and `tasks.md` and makes the amendments of design decision 9. Test:
      `./node_modules/.bin/openspec validate --all --json`.
- [ ] 0.4 After 0.1: tell the owners of pull request #935, of `dash-host-jobs`, of the release
      bootstrap and of the WBS deploy tooling what decisions 9 and 11 ask of each, slice
      3.7's list, the build's place beside a gate and the four port changes included, and
      that this
      change edits no path the old cluster reconciles, so its pin needs no freeze. Receipt:
      the four messages, dated, in verify.md.
- [ ] 0.5 Escrow what the new cluster needs (guard 2), before stage 1 and before h1claw is
      deleted (R30). Who: owner. Copy into escrow, from the host that holds each: the backup
      archive key, which lives on h1claw; the registry CA key pair; the object storage
      credentials; the old cluster's age identity. Then, on a machine that never held the
      originals, read each back and compare its fingerprint with the escrow entry
      ([recovery](../../../docs/infra/recovery.md#recovery-secrets)). Receipt: "matched", four
      times and dated, in verify.md; no value and no fingerprint. Stop: any is missing or
      differs; nothing else proceeds and h1claw is not deleted. Rollback: none needed; a copy
      is added and nothing is removed.
- [ ] 0.6 The rules that guard `main` (design decision 3). Who: owner. For this repository and
      for the fleet repository, both before A2; for the WBS deploy repository, if it exists,
      before its first Application is merged, with its own check required; for the staging pins
      repository, before the App is installed on it (A23). Commands: record the tip SHA of `main`; read
      the rules that apply to it with `gh api repos/<repository>/rules/branches/main`; add
      what is missing so that a change needs a pull request and the required checks and no
      push may be direct, forced or deleting; on the fleet repository require its
      `fleet-check`; list the bypass actors. The rules against forced and deleting pushes are
      proved by reading them back, never by pushing. The rule against a direct push is proved
      by one push of an empty commit from an account that is not a bypass actor. Receipt: the
      rules read back for each repository; that push refused; the bypass list, which names
      no agent account; the tip SHA unchanged. Stop: the push is accepted. Then the tip SHA
      has moved by one empty commit: restore it by reverting that commit through a pull
      request, and correct the rule before anything else. Rollback: none needed; no rule is
      loosened. Read on 2026-11-21: this repository's `main` requires a pull request with zero
      approvals and the status checks `gate` and `pixels`, not strict, with no bypass actor
      and no rule against forced or deleting pushes; the fleet repository's `main` had no
      rule. Zero approvals and non-strict checks stay as they are and are listed under Risks
      in design.md.

## 1. Fleet model and roles (agent slices)

- [ ] 1.1 Add the capabilities `platform-services` and `nonproduction` to `CapabilitySchema`,
      `fleetCapabilities`, `purposeCapabilities.platform` and `RequiredCapabilitiesSchema` in
      `tools/tool-fleet/src/contracts.ts`. Test: `contracts.test.ts` accepts a platform node
      that carries each. Negatives, for each capability: a workers node carrying it is
      refused; a platform cluster whose floor names it with no such node is refused. Fault to
      inject: add each to `purposeCapabilities.workers` and watch its workers negative pass
      wrongly.
- [ ] 1.2 Role rules and the platform taint. In the production placement check: the
      `control-plane` node of a platform cluster that requires `platform-services` carries it
      and none of `product`, `nonproduction` and `ingress`; no node carries both `product`
      and `nonproduction` (design decision 1); no host in `gate_hosts` is in a k3s group of the same
      inventory. In the `k3s_server` template: a server with `platform-services` writes
      the taint `CriticalAddonsOnly=true:NoSchedule` (R25). In `validate-enrollment.yml`: the
      CoreDNS step appends the enrollment toleration when it is absent (a JSON patch that adds
      one list entry) where it now replaces the whole list with a strategic patch, so the
      packaged `CriticalAddonsOnly` toleration stays. Test: the template renders the taint;
      the play's contract test reads the patch type; in the rehearsal of 2.7 a one-node server
      registered with both taints brings CoreDNS to Ready, `validate-enrollment.yml` passes,
      and CoreDNS, the metrics server and the volume provisioner are Ready afterwards.
      Negatives, each with its own fault: a server with `product` is refused (fault: drop the
      capability comparison); a node with `product` and `nonproduction` is refused (fault: check
      the server only); a gate host under `k3s_agents` is refused (fault: skip the gate-host
      comparison); a `platform-services` server whose rendered config lacks the
      taint fails the role test (fault: remove the template branch); a play whose CoreDNS
      step replaces the toleration list fails the contract test (fault: restore the strategic
      patch). The existing two-node path keeps passing its tests unchanged. Stop: validation
      cannot pass on one node with both taints. Then the cause is reported and the owner
      decides; R25's alternative (selectors and rule 2.4(f) alone) is not applied silently.
- [ ] 1.3 Repeats once per server, after A1, A9, A12 and A16 and before the step that enrolls
      the host. The first revision follows the A1 that creates the server that stays: a
      server used for the rehearsal of 2.7 is never recorded. Each revision records the
      node's machine id and private address where the fleet model already records them for
      the two existing nodes (`desired.yaml`, the inventory) (R5); a public address or a
      provider id goes to `$OPS` only and never into this repository. Add the cluster
      `platform-2` (R5) to `infra/fleet/desired.yaml` with its first node and the floor
      `platform-services: 1`; later revisions add each node, raise the floor for its
      capability, and extend `puni_enrolled_private_addresses`. Add
      `infra/ansible/inventory/production-hosts.yml` with the same nodes, the reservations of
      design decision 2, and `h8ci` under `gate_hosts` only. The jump of R17 is an input in
      `$OPS`, not a line of the inventory. Extend `placement.test.ts` to bind this inventory
      to `platform-2` beside the existing pair. Negatives: a machine id that differs between
      the two files is refused; a node present in one file only is refused. Fault to inject:
      compare node names only and watch the machine-id negative pass wrongly.
- [ ] 1.4 Reservations and coexistence record for a node without Docker services or a
      migration overlap: a record for `h7obs` under `infra/argocd/units/observability`, the
      reservations in the new inventory, and MLflow's limit (R15). Test: the observability
      budget test reads the new record. Negative: a reservation in the inventory that differs
      from the record fails. Fault to inject: read the old record for the new node and watch
      the negative pass wrongly.
- [ ] 1.5 `observability-source.ts` takes the cluster as input: the inventory path, the peers
      and the API endpoint come from that cluster's inventory and `desired.yaml` entry, not
      from literals. Test: the existing source tests pass for the old pair unchanged and for
      the new pair. Negative: a peer absent from the named cluster's inventory is refused for
      each cluster. Fault to inject: restore one literal and watch the new cluster's negative
      pass wrongly.

## 2. Argo CD delivery (agent slices)

Slices 2.1 to 2.6, 2.9 and the receipt 2.7/A3 are needed before A3 and A4; 2.8 before stage 3;
2.10 before A17.

- [ ] 2.1 Locked install and CLI. Vendor the Argo CD v3.6.2 install manifest in
      `infra/argocd/install` with its SHA-256 under `manifests.argocdInstall` in
      `infra/versions/toolchain.json`, lock the `argocd` CLI of the same version under
      `binaries`, and add a schema variant that keeps retained locks readable. The
      kustomization removes Dex, the notifications controller and the ApplicationSet
      controller; pins every image by digest; sets the selector, toleration and the limits of
      R24; sets `kustomize.buildOptions: --enable-helm`, `policy.default: role:readonly`,
      `application.sync.requireOverridePrivilegeForRevisionSync: "true"`,
      `server.rbac.rollback.enforce.enable: "true"`, the local account with the one grant of
      R23 and `admin.enabled: "false"`; adds the NetworkPolicy. Test:
      `contracts.test.ts` accepts the lock and the render has four workloads. Negatives, each
      with its own fault: changed manifest bytes are refused (fault: drop the digest
      comparison); a rendered image without a digest is refused; a render with an Ingress,
      with `admin` enabled or with a default role other than `role:readonly` is refused; a
      policy that grants the account `sync` outside `production/*`, or `override` or
      `rollback` anywhere, is refused (fault: widen the grant to `*/*`); a render without the
      override setting is refused; a render without the rollback setting is refused (fault:
      drop the key); a render with the health customization for `argoproj.io/Application` is
      refused, because the design relies on its absence.
- [ ] 2.2 Wrapper charts. For cert-manager and Traefik: a chart directory under
      `infra/argocd/units` whose `Chart.yaml` names the locked archive as a dependency, whose
      `charts/` holds it, and whose values are those of the existing `HelmRelease`. Its
      `releaseName` is the old release's name, because selectors in the tree name it. Test:
      the locked `helm template --include-crds` output of the wrapper equals the render
      `tool-fleet` already makes of the `HelmRelease`, release name and CRDs included, apart
      from placement, and `helm template` succeeds with the network disabled. Negatives, each
      with its own fault: an archive whose SHA-256 differs from the lock is refused (fault:
      skip the digest comparison); a value that renders differently on a second run fails
      (fault: add a generated value); a wrapper with another release name fails the equality
      test (fault: drop `releaseName`).
- [ ] 2.3 Platform-stage units: `namespaces`, `policy`, `storage` and `issuers` as kustomize
      directories under `infra/argocd/units`, copied from the manifests the Flux stages
      `controllers`, `policy`, `storage` and `platform` render: every namespace, the admission
      and network policy, the storage classes, the registry CA issuer and the staging ACME
      issuer, with no Distribution workload (R10), without the `registry-tls` Certificate,
      which is the Harbor unit's, and without the `otel-server` pair, which is slice 2.8's.
      `namespaces` also carries `website-prod-logs`, which no manifest of this repository
      declares today, the staging namespaces and the three dev namespaces of design
      decision 1. The ConfigMap `puni-trusted-workload`
      carries the ignore rule of design decision 3. Test: each directory's render equals the
      old stage's render at this commit, apart from Flux kinds, placement and the rows of
      decision 3's table. Negatives: a copy that drops a NetworkPolicy fails the equality test
      (fault: delete one copied object); a `policy` Application without the `solverImages`
      ignore rule and `RespectIgnoreDifferences=true` fails the `delivery` check (fault:
      remove the rule).
- [ ] 2.4 Application graph and the `delivery` check family. Add the root Application and the
      `root` AppProject under `infra/argocd/root`; the `platform`, `staging` and `production`
      AppProjects and one Application file per unit of orders 0 to 3 under
      `infra/argocd/clusters/platform-production`; and `tools/tool-fleet/src/argocd.ts`,
      wired into `tool-fleet:check`. The check refuses each of the following. Each letter has
      its own negative and its own row in `check-faults.ts`, whose fault is that rule removed.
      (a) An Application outside its project's sources or destinations, with a destination
      other than the in-cluster API, or with a `targetRevision` other than `main` in its
      file. A `staging` or `production` project whose destinations are not exactly the
      namespaces the `namespaces` unit declares for it, named one by one: a wildcard,
      `argocd`, the store's namespace or any namespace outside that list is refused; one
      that admits a cluster-scoped kind or a Namespace; one without a
      `namespaceResourceWhitelist`, or whose list names a kind its overlays do not render. A
      `platform` Application whose objects land in an app namespace, unless it is
      `namespaces`, `policy` or `secret-sync`, which write there by design (design decision
      3). A fleet-sourced Application in `platform` other than `public-issuers` at its one
      path. Three negatives of its own: a `staging` project widened to `argocd`; one widened
      to the store's namespace (fault: refuse only a namespace of the other environment, as
      the fifth draft did); and a platform unit other than those three that renders into a
      staging namespace (fault: exempt the whole `platform` project). (b) Automation in the
      wrong place: a `staging`
      Application without automated `prune`, `selfHeal` and a retry policy; a `production`
      or `platform` Application with automated sync; a root without automated self-heal, or with
      prune; any Application with the resources finalizer. (c) A `puni.dev/sync-order`,
      `puni.dev/needs` or project that is missing or differs from the table of design
      decision 3; a need of the same or a higher order; and a unit ordered at or below the
      unit that provides a Secret it reads, with the same-unit Job exception of that decision.
      (d) A rendered object of a `toolkit.fluxcd.io` group, a remote kustomize base, a
      document with a `sops` key or a Secret object under an Application source path, or a
      sync-wave annotation on an Application. (e) A file that is in an Application's source
      closure and in the closure of a Flux unit under `infra/clusters`, chart archives
      excepted. (f) A pod template without a capability selector, or one that tolerates
      `CriticalAddonsOnly` or every taint without selecting `platform-services`. The three
      node-agent DaemonSets of design decision 1 are exempt by name; a fourth DaemonSet, or a
      Deployment, with a blanket toleration is refused. (g) A PersistentVolumeClaim, a
      namespace that holds one, or an Elasticsearch, Prometheus or Alertmanager resource
      without `Prune=false` and `Delete=false`. (h) A Distribution workload. (i) A Job that
      carried Flux's `force` annotation without `Force=true,Replace=true`. (j) A kustomize
      unit that inflates a chart whose archive has a `crds/` directory at any depth without
      `includeCRDs: true`, or a Helm source of such a chart with `skipCrds`. (k) A `staging`
      Application whose source is a production overlay, or the reverse; an ExternalSecret
      in one environment whose store path names the other; a pod template of a `staging`
      Application that does not select the capability `nonproduction`, or one of a
      `production` Application that does not select `product`; a rendered object of a
      staging or production Application (an environment value, a ConfigMap value, a
      NetworkPolicy peer, an ExternalName) that names a namespace of the other or a
      Service in one. (l) Anything in the root's source path
      that is not an Application or an AppProject; a `root` project that admits another kind
      or a destination other than the `argocd` namespace; an Application file with an
      `operation` block; an Application in the `root` project other than the root; an
      AppProject file with `roles` or `syncWindows`; a file in the root's path that defines
      an Application or an AppProject named like the root or its project. (m) An
      Ingress, a Traefik `IngressRoute` or `IngressRouteTCP`, or a Certificate of a staging
      or production Application that names a host outside the list the `policy` unit holds
      for its namespace, or a host that two namespaces' lists share; slice 2.10 enforces
      the same list at admission. (n) A PersistentVolumeClaim in the tree that no
      backup CronJob of its unit mounts, unless a short exemption table names it with its
      reason; the table starts with `wbs-mcp` (design decision 7) and the stores an operator
      snapshots. The family also runs as
      `argocd.test.ts` over the repository's real tree, as `platform.test.ts` does for
      `validatePlatform`, and that project's inputs name `infra/argocd/**`, so the required
      `gate` check selects it for a change under that path alone. Negative: a change to one
      file under `infra/argocd` selects the test (fault: drop the input glob).
- [ ] 2.5 Bootstrap and sync playbooks, and the controller that runs them.
      `infra/ansible/playbooks/argocd.yml`: require the cluster id, the install digest and
      the secret file list; refuse a host that has a `flux-system` namespace or whose node
      name is in another inventory; create the immutable identity ConfigMap
      `kube-system/puni-cluster-<id>` when the cluster has none, as only the Flux play does
      today, and refuse a cluster that has one for another id; apply the `namespaces` unit;
      decrypt each bootstrap Secret of design decision 5 on the controller with `sops` and
      apply it through the API under `no_log`; apply the install with a server-side apply;
      wait for the workloads; apply `infra/argocd/root`, which is the root Application and its project.
      `playbooks/argocd-sync.yml`: take a list of platform units; refuse a unit that is not
      in the `platform` project, and a unit while one of the units its `puni.dev/needs`
      names is not Synced and Healthy; sync each in order with the locked `argocd` CLI in core
      mode on the server and wait for Synced and Healthy. Its removal mode deletes the
      Application object of a unit of any project, since nothing else can delete a staging or
      production Application, and refuses one that still has a file on `main` or whose live
      source renders more than the marker ConfigMap. The controller: add the locked `sops` binary to
      `infra/controller/Containerfile`, and a read-only mount of a fleet repository checkout
      to `fleet_ansible`, named by an input in `$OPS`. Test: `infra/ansible/tests`, including
      a second run of `argocd.yml` with one more secret file, which changes that Secret and
      nothing else; the image test finds `sops` at its locked digest. Negatives, each with
      its own fault: a wrong install digest is refused; a missing secret file is refused
      before anything is applied; a host with `flux-system` is refused (fault: remove that
      guard); a cluster that already carries another id's ConfigMap is refused and nothing is
      applied (fault: create without reading); a second run on the same cluster leaves the
      ConfigMap unchanged; the sync playbook refuses a production or staging unit (fault:
      drop the project comparison) and a unit one of whose needs is unhealthy (fault: skip
      the needs read), and syncs a unit whose needs are healthy while an unrelated unit of a
      lower order is not (fault: compare orders, as the fourth draft did); the removal mode
      refuses a unit whose file is still on `main` (fault: skip the file read) and removes a
      fixture production Application reduced to its marker (fault: apply the sync mode's
      project comparison to removal).
- [ ] 2.6 Health and recovery for a cluster delivered by Argo CD. `tool-fleet:health` gains a
      rule that reads Applications where the cluster's delivery is Argo CD and no longer
      reports "no Flux objects" there. It fails on a Degraded Application, on a staging
      Application that is OutOfSync and on an Application in the cluster that has no file; it lists a production or platform Application that is
      OutOfSync with how long it has been so, without failing. The recovery manifest and
      `verify-cold-restore` accept such a cluster, and the drill's last step reads the root
      Application. Test: the health and recover suites for both deliveries. Negatives: a
      Degraded Application fails health; an OutOfSync staging Application fails health; an
      Argo CD cluster with no Application fails health. Fault to inject: treat a missing
      Application list as healthy.
- [ ] 2.7 Rehearsal. A k3d lab profile that brings the new tree up with the bootstrap and
      sync playbooks' steps, and the staged build on the QEMU lab. Host: the operator
      workstation, which has `/dev/kvm`, once it has 60 GiB free; it does not today.
      Otherwise, as design decision 10 states: the k3d part on a server created as in A1,
      and the staged build as a throwaway pass on that server and one temporary server, with
      secrets made for the pass, an uncommitted inventory and a scratch bucket. Both servers
      are deleted afterwards and nothing of them is recorded in this repository.
      Fixture Applications stand in for apps that do not exist yet. The receipt is in four
      parts, each due before the step it names, so that no part waits for units of a later
      stage.
      **2.7/A3**, before A3 and A4, with slices 1.2 and 2.1 to 2.5: (a) validation's result
      on a one-node cluster registered with both taints, and CoreDNS's tolerations after it;
      (b) orders 0 to 3 Synced and Healthy from an empty cluster, synced by the playbook;
      (c) every object of those units OutOfSync after the first sync with no Git change,
      which starts the `ignoreDifferences` list; (d) what cert-manager's hooks did; (e) that
      `argocd-secret` kept the password hash and its generated keys after a sync of `argocd`;
      (f) whether helm followed a linked chart archive; (g) a rewritten `solverImages` left
      alone by a sync of `policy`; (h) the CLI in core mode syncing a platform unit with no
      Argo CD account; (i) with fixture Applications: the local account syncing a production
      one, refused on a platform and a staging one, refused a revision other than the
      Application's, and refused a rollback; a manual edit reverted on staging and left in
      place and reported OutOfSync on production; a merge left unapplied on production until a
      sync; automation switched on in the cluster for a production Application and switched
      off again by the root; an Application file removed and its object left in place; an
      `operation` block refused by the check; a deleted manifest whose claim survived; a unit
      reduced to its marker and synced with prune losing its workloads and keeping its claim,
      then removed by the removal mode; (j) the playbook refusing a unit whose need is
      unhealthy and syncing an unrelated one.
      **2.7/A7**, before A7, with pull request #935's units: orders 4 to 7 Synced and Healthy;
      an ExternalSecret without a value keeping `secret-sync` from Healthy; with the store
      sealed, the units that need `secret-sync` refused and `eck-operator` synced.
      **2.7/A14**, before A13, with slice 2.8: the unit states after each staged join, with
      the firewall refreshed first, and the time of an etcd restore; orders 8 to 12 Synced
      and Healthy; a changed `force` Job recreated; the Velero and Prometheus stack CRDs
      present; whether kustomize inflated a chart from a local archive with the network
      disabled; a Certificate that cannot be issued keeping its unit from Healthy; the
      `otlp-ingress` NetworkPolicy selecting the collector's pods; the rest of the
      `ignoreDifferences` list.
      **2.7/A18**, before A17's sync of slice 2.10 and A18: Traefik's CRDs present; with
      slice 2.10 and fixtures, a pod in a staging namespace that selects `product` denied,
      an IngressRoute there that names a production host denied, and an object of a kind
      outside the staging project's whitelist refused at sync; with the real staging
      overlays, a merge that changes two dependent staging units at once converging by
      retry, with the retries counted; and how a staging overlay read a digest from a
      second repository (slice 3.7), or that it could not.
      Stop: a unit cannot become Healthy, or validation cannot pass with one node. Then
      design decisions 3 and 6 are revised before the step that part gates. Fallbacks already
      decided: for (e), the Secret leaves the managed set; for (f), the wrapper holds a copy,
      and Velero uses a committed render. For (a) and (h) there is none: the owner decides
      (slice 1.2, design decision 3).
- [ ] 2.8 Units for orders 8 to 12, before stage 3: the fifteen operator-provided Secrets as
      ExternalSecrets added to `secret-sync` (R22); `otel-certificates`; wrapper charts for
      the ECK operator, the Prometheus stack and the OTel collector; Velero as a kustomize
      unit that inflates its chart and carries the patch of its `postRenderers` and
      `includeCRDs: true`; kustomize units for Elasticsearch, Kibana, `elastic-settings`,
      signals, alerts and the Elasticsearch snapshots, with `Force=true,Replace=true` on the
      three Jobs and the cluster name in the Prometheus stack's values file;
      `ServerSideApply=true` where CRDs need it. The `alerts` unit leaves out the workers
      rule and every rule about an app's backup CronJob; each of those is added by the
      revision that adds its app, and one more rule fires when a production or platform
      Application has been OutOfSync for 24 hours. A table of operator-made Secrets names
      the two that ECK makes for Elasticsearch and the one it makes for Kibana, each with its
      providing unit. Tests and negatives as 2.2 and 2.3, plus, each with its own fault: a
      unit that reads a Secret with no provider (bootstrap entry, ExternalSecret, Certificate
      in the tree, or a row of the operator table) fails the `delivery` check (fault: remove
      one ExternalSecret); a unit ordered at or below its Secret's providing unit fails rule
      (c) (fault: move `signals` to Elasticsearch's order), while the `kibana-objects` Job
      reading its own unit's operator-made Secret passes; an alert rule whose selector names
      a CronJob, namespace or cluster that no unit of the tree renders at that revision fails
      the check (fault: copy the workers rule); an ExternalSecret whose value is absent keeps
      `secret-sync` unhealthy in the lab (fault: mark it healthy by a customization); the
      `otel-server` Issuer ordered at or below `secret-sync` fails rule (c) (fault: move it
      to order 3); Velero's render without the two size limits fails the equality test
      (fault: drop the patch); the Prometheus stack's render without its ten CRDs fails the
      equality test (fault: set `skipCrds`).
- [ ] 2.9 Runbook `docs/infra/build-platform-cluster.md`: the build from empty servers, with
      every `$OPS` input, the escrow step for each new secret, the receipts of A1 to A8, how
      a change reaches staging, how production and a platform unit are synced and by whom,
      how a change is reverted, what the sync order does and does not cover, how drift is
      seen, how to reach the Argo CD interface, the jump when the platform node is off,
      removing a unit in two merges, and the break-glass procedure. Link it from
      `docs/infra/README.md`. Test: the `tool-devsync` document tests and `check-indexes`.
- [ ] 2.10 Containment at admission, before A17 (design decision 3, R34). In the `policy`
      and `namespaces` units of the new tree only: the label `puni.dev/environment` on
      every namespace, reserved by the namespace-label policy; an admission policy, in the
      form the trusted-workload policies use, that denies a pod in a `staging` or `dev`
      namespace without the `nonproduction` selector and one in a `production` namespace
      without `product`; an admission policy that denies an Ingress, a Traefik
      `IngressRoute` or `IngressRouteTCP`, or a Certificate whose host is not in the list
      the `policy` unit holds for its namespace; a ResourceQuota and a default-deny
      NetworkPolicy in every non-production namespace, the three dev ones included; the
      `namespaceResourceWhitelist` of the `staging` project. Test: the policy suite on
      disposable k3d and the `delivery` check. Negatives, each with its own fault and
      `Proof:` comment: a pod in a staging namespace that selects `product` is denied
      (fault: match the namespace's name, not its label); a pod in a dev namespace with no
      selector is denied (fault: bind the policy to `staging` alone); an IngressRoute in a
      staging namespace that names a production host is denied (fault: validate Ingress
      alone); a Certificate for a host on no list is denied (fault: allow an empty list);
      a namespace relabelled by a writer other than the `namespaces` unit is denied (fault:
      drop the reservation); a non-production namespace without a quota or a default-deny
      fails the `delivery` check (fault: exempt the dev namespaces); a staging project
      whose whitelist is a wildcard fails rule 2.4(a). Stop: the host rule cannot be
      written for Traefik's custom resources in that form. Then it is reported, rule
      2.4(m) stays the only check for those kinds, and the dev follow-up may not admit
      them.

## 3. Custody, probes and what other owners provide (agent slices)

- [ ] 3.1 SQLite custody in the cluster, before A18, which first syncs it (R13, guard 3). A unit
      `sqlite-custody`: a CronJob that applies the retention of
      [recovery](../../../docs/infra/recovery.md#bucket-lifecycle) to the cluster's own
      prefixes as a pure planner plus a thin shell. Beside it, a PrometheusRule template that
      each app's overlay instantiates for its own backup CronJob, so a rule lands with its
      subject. Its source is the pair of kube-state-metrics series the existing
      `PuniSqliteBackupStale` rule reads, `kube_cronjob_status_last_successful_time` and
      `kube_cronjob_created`: it fires when the last success is older than two intervals,
      when the job has never succeeded for that long, and when the series is absent. The new
      cluster's app overlays set `BACKUP_PREFIX` to a value that names the cluster and the
      environment and is neither `sqlite` nor under `sqlite/`. Test: the planner over a
      fixture listing; `tool-deploy:test:backup` with one prune run; the rule under
      `promtool`. Negatives: a snapshot whose report is missing is kept and reported; the
      newest report is never planned for deletion; a listing error deletes nothing; an app
      overlay whose prefix is `sqlite` or begins with `sqlite/` fails the `delivery` check;
      two overlays with one prefix fail it; a staging overlay that reads the object storage
      credential a production overlay reads fails it; a last success older than two intervals fires the
      rule; an absent series fires the rule. Faults to inject, one per negative: delete a
      snapshot without its report; drop the newest-report guard; treat a partial listing as
      complete; refuse only the bare `sqlite`; compare prefixes within one environment only; skip the credential comparison;
      compare the age against four intervals; drop the `absent()` branch.
- [ ] 3.2 Before A14, whose `probes` unit it fills. Outside liveness probes (R16): one probe
      per k3s node and per gate host from the observability stack's blackbox exporter, and a
      host timer on the platform node that probes the observability node. Test: the rules
      render. Negative: a node in `desired.yaml`, or a host in `gate_hosts`, with no probe on
      another node fails the `delivery` check. Fault to inject: read `desired.yaml` only and
      watch the gate-host negative pass wrongly.
- [ ] 3.3 After A10: rewrite the gate sections of `AGENTS.md` and `docs/infra/gate-hosts.md`
      for the new host. After A22: remove h4claw and h2puni from them. Test:
      `infra/ansible/tests` and the document tests.
- [ ] 3.4 After A21 and A22: remove the cluster `platform` and its nodes from `desired.yaml`,
      delete `production-existing-hosts.yml`, reduce `placement.test.ts` and slice 1.5's
      inputs to the new pair, and rewrite `docs/infra/enroll-h4claw-h3mon.md` as a historical
      record. The Flux paths of the old cluster are removed by a later change. Test:
      `bunx nx run tool-fleet:check`.
- [ ] 3.5 Before A18's WBS part and A20. Owner: the WBS deploy tooling's owner; this change
      only names the gap. The `staging` overlay renders namespaces of its own, the solver
      one being `wbs-solver-staging` (slice 3.8), and carries that namespace's parameter
      ConfigMap, whose backend digests come from the staging pins (design decision 1); both
      overlays carry the selector patches of design decision 1, a backup prefix per decision
      7, ExternalSecrets in place of the SOPS Secrets they expect, the stale-backup rule of
      3.1, NetworkPolicies that only allow, since each namespace's default-deny is the
      `policy` unit's (slice 2.10), and image references that name Harbor (R28); the WBS alert group is added to `alerts` with each. The `delivery`
      check reads both under rules (f), (g), (k), (m) and (n) and the rules of 3.1. Test: both
      overlays render together into one fixture cluster with no object in common. Negatives:
      an overlay that renders `wbs` or `wbs-solver` for staging is refused; a WBS workload
      without a selector is refused; a staging value that names `wbs`, `wbs-solver` or a Service in either is
      refused. Faults to inject: compare the two renders by kind only and watch the shared
      namespace pass; search object names only
      and watch the staging value that names a production Service pass.
- [ ] 3.6 Before A15 (R15). A unit `mlflow` under `infra/argocd/units`: the MLflow server
      pinned by digest, selecting `observability`, with a `Retain` claim carrying
      `Prune=false` and `Delete=false`, the apps' backup and verify CronJobs with a prefix
      per decision 7, and the stale-backup rule of 3.1. How MLflow lays out its store on
      h3mon is read first and recorded; if it is more than one SQLite file and one
      directory, the slice stops and reports. Test: the render passes the `delivery` check
      and the backup runner's suite restores a fixture store. Negative: the unit without its
      backup CronJob fails rule 2.4(n). Fault to inject: add `mlflow` to that rule's
      exemption table.
- [ ] 3.7 Blocks no step; until it lands a staging pin is moved by hand (R31, R35, design
      decision 9). Owners: the release bootstrap's and the WBS deploy tooling's owners for
      each app's build entrypoint and for how its staging overlay reads the pins; the gate
      pool's owner for the catalogue entry, its launcher checkout, `concurrencyEligible`, the
      build user and how it submits to the pool; the owner for the staging pins repository
      and the App; this change for the trigger's shape, the hook and the lint. In this
      repository: a workflow on `push` to `main`, filtered by the app's paths, and on manual
      dispatch, with no other trigger, whose one job runs on the build label, starts a
      catalogue job through `run_heavy_job` and reports its exit;
      `infra/ci/deploy-runner/job-started.sh` generalised to an allow-list of workflow files
      at `refs/heads/main` read from the runner's own `.env`, with the existing deploy runner
      keeping its one entry; and the choice, shown in rehearsal 2.7/A18, of how a staging
      overlay reads its digests from the pins repository (design decision 9 names two
      candidates). Nothing in the workflow writes to this repository. Test: the hook's
      existing proof, for one entry and for two; the workflow lint in `gate`. Negatives, each
      with its own fault: the hook fails a job whose workflow reference is a pull-request
      ref, a branch other than `main`, or a workflow not on the list (fault: compare the
      file name without the ref); a workflow that names the build label and has any trigger
      other than `push` to `main` and `workflow_dispatch` is refused, `pull_request`,
      `pull_request_target`, `issue_comment` and `workflow_run` among them (fault: refuse a
      list of named triggers, as the sixth draft did, and watch `workflow_run` pass); one
      that passes a GitHub secret to a build or push step is refused (fault: drop the secret
      rule); one whose job on the build label does not go through `run_heavy_job` is refused
      (fault: drop the launcher rule); one that grants `contents: write` or pushes to this
      repository is refused (fault: drop the permission rule).
- [ ] 3.8 Before A17's solver step and A18's WBS part (R32, R29). The solver bound per
      environment, with one pod caller on a node each. In `tools/tool-remote-scripts`: the
      supervisor's closed caller list gains `k8s_wbs-solver-staging_backend`; in
      `solver-supervisor-image-map.ts` the decoder accepts a null caller image for that name,
      as it does for `wbs-dev-src`, and keeps throwing for `k8s_wbs-solver_backend` and every
      other pod caller, with the existing `Proof:` comment and test kept and a new pair
      beside them. In the new tree's `policy` unit only (the Flux copy is not edited): the
      trusted-hostpath policy admits, per environment, one namespace and one selector
      (`wbs-solver` with `product`; `wbs-solver-staging` with `nonproduction`) and the one
      host directory, and no dev namespace; the namespace-label policy reserves both names;
      each environment has its own parameter ConfigMap and binding, production's left out of
      the tree as today and staging's read from the staging overlay. In the `solver` role:
      the assertion accepts a node that carries exactly one of `product` and
      `nonproduction`, and the non-production inventory gives the staging caller one rule
      with no caller image. The old cluster's play and bundle are unchanged. Test: the
      supervisor's image-map suite, the policy suite on disposable k3d, and the role's tests
      for a product node and a non-production node. Negatives, each with its own fault and
      `Proof:` comment: a staging pod presenting its caller name is refused by a supervisor
      whose list lacks it (fault: accept any name that begins with `k8s_wbs-solver`); a
      production rule with a null caller image is still refused by the decoder (fault: allow
      null for every pod caller); a staging rule with a null caller image decodes; a
      production backend that selects `nonproduction` is denied (fault: compare the selector
      against the union); a pod in the staging namespace with an image from production's
      list only is denied (fault: bind both namespaces to one ConfigMap); a pod in a dev
      namespace that mounts the host directory is denied (fault: admit every non-production
      namespace); a third namespace carrying the trusted label is denied (fault: match the
      label alone); a node with both capabilities fails the role's assertion (fault: accept
      either). Stop: the role's inventory or the copied policy cannot express a rule with no
      caller image or a ConfigMap owned by the overlay. Then the slice stops and reports.
      Staging would need the operator's two writes for each backend, as production does, and
      the owner is told that R20 does not hold for the WBS backend until that is solved.

The sixth draft's slice 3.9, the dev environment, is not in this change: it is the follow-up
`add-dev-environment` (R34, design decision 9).

## 4. PostgreSQL hosting (agent slices)

All five are due before stage 6 and block nothing earlier (design decision 11, R36 to R42).

- [ ] 4.1 The database role. Add the capability `database` to `CapabilitySchema`,
      `fleetCapabilities`, `purposeCapabilities.platform` and `RequiredCapabilitiesSchema`. In
      the production placement check: a node that carries `database` carries nothing else. In
      the `k3s_agent` template: a node with `database` also writes the taint
      `puni.dev/role=database:NoSchedule` (R37). The inventory revision for `h10db` follows
      A24, as slice 1.3 does for every server, with the reservations of design decision 2 and
      the floor `database: 1`. Test: `contracts.test.ts`; the template renders both taints.
      Negatives, each with its own fault: a workers node carrying `database` is refused
      (fault: add it to `purposeCapabilities.workers`); a node with `database` and `product`,
      or `database` and `ingress`, is refused (fault: compare against `product` only); a
      `database` agent whose rendered config lacks the taint fails the role test (fault:
      remove the template branch); an agent without `database` renders no such taint (fault:
      write it for every agent).
- [ ] 4.2 Locks and the two operator units. Lock the `cloudnative-pg` chart 0.29.2 and the
      `plugin-barman-cloud` chart 0.9.0 by digest in `infra/versions/toolchain.json`, with
      their images and the PostgreSQL operand image by digest, and a schema variant that keeps
      retained locks readable. Units `cnpg-operator` and `barman-plugin` under
      `infra/argocd/units` as wrapper charts in one namespace, selecting `platform-services`
      with the toleration of R25, with limits of 256 MiB each, `ServerSideApply=true`, the
      chart's PodMonitor and dashboard off, and their Application files at orders 18 and 19.
      Test: the locked `helm template` of each wrapper succeeds with the network disabled and
      renders the same bytes twice. Negatives, each with its own fault: an archive whose
      SHA-256 differs from the lock is refused (fault: skip the comparison); a rendered image
      without a digest is refused (fault: leave the operand image as a tag); a plugin unit
      outside the operator's namespace fails the `delivery` check (fault: drop that
      comparison); an operator unit ordered at or below `policy`, or a plugin ordered at or
      below `cert-manager`, fails rule (c).
- [ ] 4.3 The cluster units and rule (o). Units `nonproduction-db` and `platform-db` as
      kustomize directories in the `platform` project, each with a `Cluster` (one instance,
      `puni-retain`, the claims of design decision 2, the selector of its node, superuser
      access off, the plugin as its WAL archiver), an `ObjectStore` with a 30-day recovery
      window, a nightly `ScheduledBackup` with the method `plugin`, a PodMonitor, the
      databases `canary-a` and `canary-b` with one `DatabaseRole` each, and ExternalSecrets
      for the object storage key and the two role passwords; the namespaces `postgres`
      (environment `platform`) and `postgres-nonproduction` (environment `staging`) in the
      `namespaces` unit; a SecretStore for each in `secret-sync`; a clause in slice 2.10's
      placement policy that a pod in `postgres` selects `database`; NetworkPolicies that
      allow the operator, the scrape and port 5432 from the namespaces that have a database
      there. The `delivery` family gains rule (o), which refuses: a `Cluster` whose
      `affinity.nodeSelector` is not the capability design decision 11 names for it; a
      toleration of the database taint anywhere but `platform-db` and the three node agents;
      a `Cluster` without `Prune=false` and `Delete=false`, on a storage class that does not
      retain, with superuser access on, with `enablePodMonitor`, with the in-tree
      `barmanObjectStore`, or without a WAL-archiving plugin, a `ScheduledBackup` and a
      PodMonitor of its own unit; an `ObjectStore` of one cluster that reads the credential
      of the other; a `Database` whose owner role owns another database; a `Cluster`, a
      `Database` or a `DatabaseRole` in a `staging` or `production` Application; a Velero
      schedule that includes a database namespace. Rule 2.4(n)'s exemption table gains the
      claims the operator makes for a `Cluster`, with their backup named. Test: both units
      render and pass the `delivery` check; on disposable k3d with the operator and an
      object store fixture, a cluster starts, archives WAL and completes a backup. Negatives:
      one per refusal above, each with its own row in `check-faults.ts` whose fault is that
      clause removed; on k3d, the role of `canary-a` is refused a connection to `canary-b`
      (fault: leave `public` its connect privilege); a pod applied to `postgres` with the
      `product` selector is denied (fault: bind the clause to `staging` namespaces only).
- [ ] 4.4 Alerts, logs and query statistics. A PrometheusRule in each cluster unit: data or
      WAL volume above 80% and above 90%; WAL not archived for 10 minutes; no base backup for
      26 hours; instance not ready; connections above 80% of the limit; a transaction open
      for more than 5 minutes; and, for `platform-db`, the restore drill failed or absent.
      The series names are read first from the operator's default monitoring ConfigMap and
      the plugin's metrics page at the locked versions and recorded in verify.md. The
      `Cluster` parameters: `log_min_duration_statement` 500 ms, `log_lock_waits` on,
      `log_temp_files` 0, `pg_stat_statements` with a custom metrics query for the heaviest
      statements. No replica-lag rule: it lands with the replica. Test: every rule under
      `promtool` with a series fixture. Negatives, each with its own fault: each rule fires
      on its fixture and stays quiet below its threshold; the WAL rule fires when its series
      is absent (fault: drop the `absent()` branch); the backup rule fires at 27 hours and
      not at 25 (fault: compare against 48 hours); the drill rule fires when no drill result
      exists (fault: treat absence as success); a logged statement that carries a connection
      string is redacted by the collector's rules (fault: remove the pattern). Stop: the
      collector's redaction cannot cover it. Then statement logging stays off and the owner
      is told.
- [ ] 4.5 Dumps, the restore drill and the one-database rollback. In `platform-db`'s unit: a
      nightly CronJob that dumps each database to its own object under a prefix of its own,
      kept 90 days by the planner of slice 3.1; a weekly CronJob that restores the cluster
      from the object store into a throwaway `Cluster` on the database node, runs sanity
      queries against it, records the duration, deletes it and its claims, and exports the
      result and its time as a metric; both scheduled apart, and neither at the base backup's
      hour. A runbook, `docs/infra/postgres-recovery.md`, linked from `docs/infra/README.md`:
      a full restore; a point-in-time restore beside the live cluster; copying one database
      back; what a lost database node needs. Test: the dump planner over a fixture listing;
      on k3d, the drill job restores a fixture cluster and reports; the document tests.
      Negatives, each with its own fault: a dump listing error deletes nothing (fault: treat
      a partial listing as complete); the newest dump of a database is never planned for
      deletion (fault: drop that guard); a drill whose sanity query fails reports failure and
      still deletes the throwaway cluster (fault: exit before the report); a drill pointed at
      the live cluster's own name is refused (fault: drop the name comparison); a throwaway
      cluster that carries a WAL archiver is refused, so a drill can never write into the
      live archive (fault: copy the live cluster's plugin stanza).

## 5. Attended steps

### Stage 1: platform

- [ ] A1 Create the platform server. Who: owner. Command: the provider console; 8 vCPUs,
      16 GiB (R2), the private network of the existing hosts, Ubuntu 26.04, the admin key.
      Receipt: `/etc/machine-id`, the SSH host key fingerprint, the private address and
      interface, `nproc`, `free -m`, `df -h /`. Stop: the host is not on the private network
      or answers on a public port other than SSH. Rollback: delete the server. A server used
      for the rehearsal of 2.7 is deleted first; this receipt is of the server that stays.
- [ ] A2 Make and escrow the new cluster's secrets (R6), after 0.5 and 0.6. Who: owner.
      Commands: two 64-hex k3s credentials, `age-keygen`, read-only deploy keys for the fleet
      repository and the WBS deploy repository, and the local account's password, into
      `$OPS`; the encrypted files of design decision 5 into the fleet repository's directory;
      a copy of each original into both escrow places. Receipt: "escrowed" per secret beside
      its escrow entry, and "restored on a second machine" for the age identity. Stop: an
      escrow place is unavailable. Rollback: discard the files; nothing uses them yet.
- [ ] A3 Bootstrap the server, after 1.1, 1.2, the first 1.3 and the receipt 2.7/A3. Who:
      operator. Commands:
      `fleet_ansible --limit h5plat --extra-vars puni_preflight_stage=before-enrollment playbooks/preflight.yml`,
      `fleet_ansible --limit h5plat playbooks/bootstrap.yml` twice (the second prints
      `changed=0`), `playbooks/validate-enrollment.yml`, then preflight with
      `puni_preflight_stage=after-enrollment`. Read both join tokens into `$OPS` and escrow.
      Receipt: `kubectl get nodes -o wide` shows h5plat Ready with roles `control-plane,etcd`,
      the label `puni.dev/capability-platform-services=true`, the taint
      `CriticalAddonsOnly=true:NoSchedule` and no enrollment taint; CoreDNS, the metrics
      server and the volume provisioner Ready; CoreDNS still tolerates `CriticalAddonsOnly`.
      Stop: validation fails or the second bootstrap changes anything.
      Rollback: delete the server and repeat from A1.
- [ ] A4 Argo CD and the units under OpenBao, after 0.6 and slices 2.1 to 2.6 and 2.9. Who:
      operator. Commands:
      `fleet_ansible --limit h5plat --extra-vars puni_cluster_id=platform-production --extra-vars @"$OPS/argocd.json" playbooks/argocd.yml`;
      then sync `argocd`, `namespaces`, `policy`, `storage` and `cert-manager`.
      Receipt: `kubectl get applications -n argocd` shows the root and orders 0 to 3 Synced
      and Healthy; the root is in the project `root` and has no prune; every Argo CD and cert-manager pod is on h5plat; the interface answers
      through `kubectl port-forward`; the local account logs in and is refused a sync of a
      platform unit; `admin` cannot log in; no Service of type LoadBalancer or Ingress exists
      in `argocd`. Stop: a unit is not Healthy after 20 minutes. Rollback: delete the server.
- [ ] A5 etcd snapshots. Who: operator. Commands: create the new snapshot bucket with
      versioning and the one lifecycle rule of
      [recovery](../../../docs/infra/recovery.md#bucket-lifecycle), and read both back;
      `playbooks/backup.yml` with that bucket and the token fingerprint;
      `k3s etcd-snapshot save`; `tool-fleet:recover record-manifest`. Receipt: the bucket's
      versioning and rule, the snapshot's object key, size and SHA-256, the manifest stored
      with the escrowed secrets. Stop: the role refuses the fingerprint. Rollback: none
      needed.
- [ ] A6 Restore drill, before OpenBao holds anything, after 2.6. Who: operator. `restore.yml`
      refuses a host whose k3s `node-name` is not the planned replacement or is a fenced
      original, so the drill uses a second, temporary server. h5plat is the jump (R17) and is
      off during the drill, so the controller's jump for this step is the temporary server's
      own public SSH endpoint. Commands: power h5plat off and record that as fence evidence;
      create a temporary server as in A1 under another name and prepare it with
      `bootstrap.yml`'s host roles and a k3s config that names it;
      `tool-fleet:recover verify-cold-restore` with the escrowed token; `playbooks/restore.yml`
      limited to it; read the root Application; then delete the temporary server and power
      h5plat on. Receipt: time from power-off to the root Synced on the temporary server; the
      fence evidence file; h5plat Ready again with its own datastore. Stop: the restore
      refuses, or the root cannot be read. Rollback: delete the temporary server and power
      h5plat on; its datastore was not touched.
- [ ] A7 OpenBao, the External Secrets Operator and the first Secrets (R22). Preconditions:
      pull request #935 merged and amended as design decision 9 lists, its own slices
      landed under `infra/argocd`, and the receipt 2.7/A7. Who: operator; owner for the values. Commands: add the
      seal key, the server CA Secret and the rest of #935's bootstrap set to the secret file
      list and run `playbooks/argocd.yml` again; sync `openbao`; follow #935's runbook to
      the point where the store serves and its recovery material is escrowed; sync
      `external-secrets`; the owner writes the registry CA key pair and one canary value into
      the store; sync `secret-sync`, then `issuers`. Receipt: orders 4 to 7 Synced and
      Healthy; the canary read back through its ExternalSecret; the registry CA issuer Ready;
      the store's pods on h5plat; #935's own receipts for seal, escrow and a first snapshot.
      Stop: the store does not serve, or the canary does not arrive. Rollback: reduce the
      three units to their markers and sync, then remove the bootstrap Secrets; the store's
      claim stays until the owner removes it.
- [ ] A8 Measure Argo CD (R24). Who: operator. After 24 hours and one merge that changes the
      tree, read each container's working set and `memory.stat`. Receipt: the per-container
      table in verify.md and the limits kept or changed by a commit. Stop: a container was
      killed for memory. Rollback: raise that limit in Git and sync `argocd`.
- [ ] Harbor lands on h5plat by its own change, amended as design decision 9 lists, synced on
      command at order 14. It is not a step of this change. It is due before A18's WBS part.

### Stage 2: continuous integration

- [ ] A9 Create the CI host and apply the gate-host role, after its 1.3 revision. Who: owner
      creates as in A1 with 16 vCPUs and 32 GiB (R2); operator applies. Commands:
      `$OPS/gate.json` with the callers' keys and `puni_gate_host_pool_enroll: false`;
      `fleet_ansible --limit h8ci --extra-vars @"$OPS/gate.json" playbooks/gate-host.yml`
      twice; a second-session login as `puni1` with each key after the first run;
      `docker buildx version` as `puni1`. Receipt: the second run prints `changed=0`; every
      caller logs in. Stop: a caller cannot log in. Rollback: delete the server.
- [ ] A10 Enroll and calibrate. Who: the owner of `dash-host-jobs`, by
      [enroll a host in the host pool](../../../docs/infra/gate-hosts.md#enroll-a-host-in-the-host-pool).
      Receipt: the pool lists the host in observe mode with its budget and headroom;
      `bin/h2puni-gate.sh <sha>` from its launcher exits 0 and prints the SHA; three
      calibration durations; the pool owner's decision on two gates at once or more tasks
      per gate. Stop: a gate fails for a reason the old hosts do not show on the same SHA.
      Rollback: keep gating on the old hosts; they are untouched until stage 5.
- [ ] A11 Release builds on the CI host. Who: the session that owns the release bootstrap,
      by its own procedure. Receipt: one release record that names h8ci. Stop: a build fails
      for a reason the old host does not show on the same commit. Rollback: keep building
      release images where they are built today. The staging build runner is A23, in stage
      4, where its inputs exist.

### Stage 3: observability

- [ ] A12 Create the observability server. Who: owner, as A1, with a root disk of at least
      180 GiB (R2). Receipt: as A1. Stop: `df -h /` shows less. Rollback: delete the server.
- [ ] A13 Join it, after its 1.3 revision, 1.4, 1.5, 2.8 and the receipt 2.7/A14. Who: operator. Commands:
      `fleet_ansible --limit h5plat playbooks/firewall.yml`, so the server admits the new
      address; preflight limited to h7obs; `fleet_ansible --limit h7obs playbooks/join.yml`
      twice; `fleet_ansible --limit h5plat playbooks/validate-enrollment.yml`, whose hosts
      are the bootstrap servers. Receipt: h7obs Ready with
      `puni.dev/capability-observability=true`, no enrollment taint. Stop: validation fails.
      Rollback: `playbooks/rollback-host.yml`, delete the Node object, delete the server.
- [ ] A14 Bring up and measure the stack, after A7 and 3.2. Who: operator; owner for the
      values. Commands: generate the Velero repository password and put it in escrow first;
      the owner writes the fifteen operator-provided values of design decision 5 into
      OpenBao, the webhook address of `#puni-alerts-dev` among them once he has made it; merge the revision that adds the units of orders 8 to 12 and their
      ExternalSecrets; sync `secret-sync`, then those units in order; after 24 hours read
      `kubectl top pods -n observability`, each container's `memory.stat` and each claim's
      use; raise one test alert. Receipt: "escrowed" for the Velero repository password;
      orders 8 to 12 Healthy, `mlflow` and `sqlite-custody` excepted, which A15 and A18
      sync; no alert firing other than the test alert; the per-pod memory
      table; disk used and its growth per day; the test alert seen in Alertmanager, and in
      `#puni-alerts-dev` if open question 1 is answered, or "delivery unproven" if not; the
      owner's decision on the node's size. Stop: a pod is killed for memory, the node's
      available memory falls under 1,024 MiB, or the disk would fill within 60 days.
      Rollback: nothing depends on the stack yet. Reduce the units to their markers and sync,
      then remove their Application files (design decision 3). Claims stay.
- [ ] A15 MLflow (R15, guard 1), after 3.6. Who: operator. Commands: the owner writes the
      MLflow backup credentials into OpenBao; merge the `mlflow` unit at zero replicas with
      its backup job suspended, together with its ExternalSecrets; sync `secret-sync`, then
      `mlflow`; stop MLflow on h3mon; take the final backup there
      as design decision 7 states; restore it into the unit's claim; merge one replica and
      the job resumed, and sync; run the backup job once. Receipt: the final backup's stamp
      and SHA-256; one known run read back from the new instance; one backup and one verify
      under the new prefix, taken after the restore. Stop: the restore differs from the
      backup's SHA-256, or a backup under the new prefix predates the restore.
      Rollback, while h3mon exists: start MLflow there again.

### Stage 4: apps

- [ ] A16 Create the production apps server and the non-production server (R29). Who:
      owner, as A1 for each. Receipt: as A1, for each. Stop: as A1, or a host has no public
      IPv4 address for ports 80 and 443. Rollback: delete the server.
- [ ] A17 Join both, after the 1.3 revision of each, slice 2.10 and the receipt 2.7/A18. Who:
      operator. Commands: `playbooks/firewall.yml` limited to the nodes already joined; then
      as A13 for h9stg and for h6apps; sync `namespaces` and `policy`, which now carry slice
      2.10; then `playbooks/solver.yml` limited to each, once slice 3.8 has landed and each
      host's Docker can pull the solver image its inventory names (design decision 9: for a
      Harbor reference, Harbor's CA and a pull robot first);
      then merge the revision that adds the `traefik` Application and sync it. Receipt: h6apps
      Ready with `product` and `ingress`, h9stg Ready with `nonproduction` and `ingress`, neither
      with the other's capability; a Traefik pod Ready on each and answering on ports 80 and
      443; one supervisor on each node with one pod caller's rule, the non-production one's
      naming no caller image; a pod applied by hand to a staging namespace with the
      `product` selector, denied. Stop: Traefik cannot bind 80 or 443, or that pod is
      admitted. Rollback: reduce
      `traefik` to its marker and sync, remove its Application file, then as A13.
- [ ] A18 Staging, on h9stg (R29, R26), after 3.1, the receipt 2.7/A18 and the fleet
      repository's directory of design decision 9; its WBS part also after 3.5, 3.8 and
      Harbor. Who: operator, with the website's owner; owner for the Secrets. The owner
      writes the staging Secrets of design decision 5 into OpenBao, reading the website's
      present ones with the old cluster's age identity on the controller; the staging backup
      credential is one that cannot read production's backups. Sync `secret-sync`,
      `sqlite-custody` and `public-issuers`. Then, for the website and request app in
      `website-dev` first and WBS staging second: stop the old side (scale the old
      Deployments to zero and suspend the old backup CronJob and its Flux unit; stop the
      Compose dev stack and the dev poller on h2puni); take the final backup of the dev store
      as design decision 7 states and record its file name, stamp and SHA-256; merge the
      staging Application with the workload at zero replicas and its backup CronJob
      suspended, which syncs by itself; check the file against the recorded value with
      `sha256sum --check` and restore it into the new claim only if it matches (guard 6);
      merge one replica and the CronJob resumed; point the names the staging overlay declares
      at h9stg; wait for the certificates from the issuer each overlay names; run the new
      backup job once. Receipt, per app: the stamp and SHA-256, and the check's "OK"; a
      listing of a production prefix refused with the staging credential; no pod of the app
      and no backup run on the new side before the restore finished; the restored store's
      check equals the backup's; for WBS, the project list of the tracker read back through
      its API, and the WBS owner's word on what `wbs-mcp` held; the pages read back on their
      names with a Ready certificate, which for WBS staging comes from the ACME staging
      issuer its overlay names and is not trusted by a browser; one backup and one verify
      under the staging prefix, taken after the restore and holding a restored record; a
      later merge to the staging overlay applied with no command; for WBS, a second backend
      digest deployed by a merge alone, with no run of `solver.yml`. Stop: the SHA-256 differs;
      the staging credential can list a production prefix; the restore differs from the
      backup; a backup under the new prefix predates the restore or is empty; or a
      certificate is not Ready after 15 minutes. Rollback, while the old hosts exist: point
      the names back and start the old side again.
- [ ] A19 The production website and request app (R26), after A18's receipt for them. Who:
      operator, with the website's owner; owner for the Secrets and for the sync. As A18 for
      production: the owner writes the production Secrets into OpenBao; the old side is
      stopped and backed up once; the production Application is merged at zero replicas with
      its backup job suspended, and the owner syncs it; the stamp is restored; one replica
      and the job resumed are merged, and the owner syncs again; the names are pointed at
      h6apps. Receipt: as A18, plus that the merged Application stayed OutOfSync until the
      owner's sync, and that the sync was made with the local account. Stop: as A18, or the
      Application syncs without a command. Rollback, while h4claw exists: point the names
      back and resume the old units.
- [ ] A20 WBS production, the simple way (R28), after 3.5, Harbor and A18's WBS receipt. Who:
      operator, with the WBS deploy tooling's owner; owner for the Secrets and for the sync.
      As A19 for WBS: Secrets and Harbor's pull credential written into OpenBao; production
      stopped on h2puni; one final backup; the `wbs` Application merged at zero replicas and
      synced by the owner; the stamp restored; one replica merged and synced; the name
      pointed at h6apps. Receipt: as A19, plus the WBS alert group present and quiet, and
      that h6apps is in no `gate_hosts` group. Stop: as A19, or the WBS owner names a step a
      first start needs that this simple move skips. Rollback, while h2puni exists: point the
      name back and start production there.

- [ ] A23 The staging build runner (R31, R35), after A18, slice 3.7, Harbor's project and
      push robot, and the staging pins repository with its rule (task 0.6). Numbered last so
      that the other steps keep their ids; it blocks no other step. Who: owner and operator.
      Commands: create the build user and its 0700 directories through the gate-host role;
      create the runner group, limited to the building repositories and to selected
      workflows, the build workflow file at `refs/heads/main`; register one persistent runner
      into that group; install the root-owned hook and set
      `ACTIONS_RUNNER_HOOK_JOB_STARTED` and its allow-list in the runner's `.env`; create the
      GitHub App and install it on the staging pins repository alone; place its key and,
      from the Harbor change's reconciler, the push robot's Docker config. Receipt: the
      runner group's repositories and selected workflows read back; the approval setting for
      outside contributors read back; the App's repository list, which names the staging
      pins repository and nothing else; the three credential files with their owner and
      mode; a pull request from a branch of this repository that adds a workflow naming the
      build label, left without a runner; a manual run of the build workflow on a branch
      other than `main`, left without a runner; the hook run by hand on the host with a
      workflow reference at another ref, exiting nonzero, and with the allowed reference,
      exiting zero; a push to `main` building and moving one staging pin, and staging running
      that digest with no command. Stop: the organisation cannot limit the group to selected
      workflows, a negative reaches a step, or the App is installed on another repository.
      Then the runner and the App are removed and staging pins stay moved by hand. Rollback:
      remove the runner and the App.

### Stage 5: retirement

- [ ] A21 Delete h4claw and h3mon. Who: owner. Preconditions: A18's and A19's receipts for
      the website and request app; A15's receipt; A10's receipt, no caller launching gates on
      h4claw (slice 3.3), and the pool owner's withdrawal of h4claw or written confirmation
      that none is needed; a test alert delivered in `#puni-alerts-dev` (open question 1); the
      word of the session that owns `release-pin.ts` that the old fleet directory may go.
      Commands: delete both servers in the console; remove the old cluster's directory from
      the fleet repository. Receipt: the provider's server list without those names; the two
      confirmations, dated. Stop: a DNS record still points at either host. Rollback: none;
      that is why the preconditions are receipts.
- [ ] A22 Delete h2puni. Who: owner. Preconditions: A18's WBS receipt and A20's receipt, or
      the owner's word for each that the data is not wanted; the owner's word that the two
      other dev databases there and the configuration archive may go (design decision 7); a
      test alert delivered in
      `#puni-alerts-dev`; A11's receipt; A10's receipt,
      no caller launching gates on h2puni, and the pool owner's withdrawal of h2puni or
      written confirmation that none is needed; the controller no longer runs there (design
      decision 10). Command: delete the server in the console. Receipt: the provider's server
      list. Stop: the staging tracker or WBS production has no verified backup under the new
      cluster's prefixes. Rollback: none; that is why the preconditions are receipts.

### Stage 6: database

Not on the path of stages 1 to 5. A26 needs no new server; A24, A25, A27 and A28 start when the
owner creates one (R37).

- [ ] A24 Create the database server. Who: owner, when he chooses (open question 2), as A1,
      with 4 vCPUs, 8 GiB and a root disk of at least 135 GiB unless he changes R37. Receipt:
      as A1. Stop: `df -h /` shows less, or as A1. Rollback: delete the server.
- [ ] A25 Join it, after its 1.3 revision and slice 4.1. Who: operator. Commands: as A13 for
      `h10db`, with `playbooks/firewall.yml` limited to the nodes already joined first.
      Receipt: `h10db` Ready with `puni.dev/capability-database=true` and no other
      capability, the taint `puni.dev/role=database:NoSchedule` and no enrollment taint; the
      only pods on it are the three node agents. Stop: validation fails, or another pod is
      scheduled there. Rollback: as A13.
- [ ] A26 The operator, the plugin and the non-production cluster, after stage 3's receipt,
      slices 4.2 to 4.4 and the store paths design decision 11 asks of pull request #935.
      Who: operator; owner for the values. Commands: the owner writes into OpenBao the
      object storage key for the non-production database bucket, one that cannot read a
      production bucket, and generates the two canary role passwords there; merge the
      Application files of orders 18 to 20 for these three units; sync `namespaces`,
      `policy`, `secret-sync`, `cnpg-operator`, `barman-plugin` and `nonproduction-db`;
      create one on-demand `Backup`; remove the object storage Secret for long enough to see
      the WAL rule fire, then let it return. After 24 hours read each container's working set
      and `memory.stat`. Receipt: the three units Synced and Healthy; the operator and plugin
      pods on h5plat; the instance on h9stg with both claims bound on `puni-retain`; both
      canary databases present and the role of one refused on the other; a first
      recoverability point and a completed base backup read from the plugin's metrics; a
      listing of a production bucket refused with this key; the WAL alert seen firing in
      Alertmanager and cleared; the per-container memory table and the limits kept or
      changed by a commit. Stop: a unit is not Healthy after 20 minutes, WAL is not archived,
      or the key can list a production bucket. Rollback: nothing reads the cluster yet.
      Reduce the three units to their markers and sync, then remove their Application files;
      the canary data is disposable and its claims are removed by hand.
- [ ] A27 The production cluster, after A25 and A26's receipt and slice 4.5. Who: operator;
      owner for the values. Commands: the owner writes the production database bucket's key
      and the canary passwords; merge the `platform-db` Application; sync `secret-sync` and
      `platform-db`; create one on-demand `Backup`; run the dump job once; apply by hand a
      pod in `postgres` with the `product` selector. After 24 hours read memory as in A26
      and `kubectl top node h10db`. Receipt: the unit Synced and Healthy; the instance and
      its sidecar on `h10db` and nothing else there but the node agents; a first
      recoverability point, a completed base backup and one dump object per database; the
      hand-applied pod denied; every PostgreSQL rule loaded and none firing; the memory
      table against design decision 2 and the owner's decision on the server's size. Stop:
      the instance is killed for memory, the node's available memory falls under 512 MiB, or
      WAL is not archived. Rollback: as A26; no app has data there.
- [ ] A28 Prove the restore, after A27. Who: operator. Commands: write a first marker row
      into `canary-a` and note the time; write a second; run the drill job once by hand;
      then follow `docs/infra/postgres-recovery.md`: restore `platform-db` beside the live
      cluster to the noted time, copy `canary-a` back, and delete the side cluster. Receipt:
      the drill's duration and its sanity result; in the live `canary-a` after the copy, the
      first marker present and the second absent, and `canary-b` unchanged; the time from
      the start of the restore to the copy's end, which replaces R41's two hours in
      design.md by a commit; the drill metric present and its alert quiet; no throwaway
      cluster or claim left and the disk back to its reading before. Stop: a restore fails,
      or the copy changes `canary-b`. Then no port may write production data to
      `platform-db`, and the owners of the port changes are told. Rollback: delete the
      throwaway clusters; the live cluster is not touched by a restore.
