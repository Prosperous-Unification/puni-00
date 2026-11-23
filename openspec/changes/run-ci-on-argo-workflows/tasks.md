Agent slices (CI-S1 to CI-S8) change source and run tests; none touches a host. Attended steps
(CI-A1 to CI-A5) each name who runs them, the command, the receipt, the stop condition and the
rollback. Ids with the prefix CI are this change's and refer to [design.md](design.md); every
other id is the core change's, [`separate-node-roles`](../separate-node-roles/tasks.md), and
"core decision n" is a decision of its design. `fleet_ansible`, `$OPS` and "sync" mean what
that change's tasks.md says. Every slice that adds a safety check lands it with a
production-path negative, watched failing with the check removed, and an adjacent `Proof:`
comment. Nothing here has been done yet.

## 0. Decisions

- [ ] CI-0.1 Owner reads assumptions CI1 to CI14 in design.md and overrules by id. Three
      were set for him on 2026-11-22 while he was away: no public path (CI11), a status
      written to GitHub (CI12) and the server's size (CI13). None is an open question.
      Receipt: the overrules, dated, as decisions in verify.md. No slice starts
      before the core change's task 0.1 has its receipt.
- [ ] CI-0.2 File the decision record from design.md as an ADR under the next free number,
      once the core change's two have theirs, link it from proposal.md, and delete the quoted
      copy. Test: `env -u CLAUDECODE bun test tools/tool-devsync/src/adr-index.test.ts`.
- [ ] CI-0.3 After CI-0.1: tell the owners design decision 9 names what it asks of each: the
      gate pool's, the gate documents', the release tooling's, pull request #935's and the
      Harbor change's. Receipt: for each owner, the date they were told and what each
      answered, recorded in verify.md as decisions with their owner, in neutral words. No
      message is copied into the repository.

## 1. Agent slices

All are due before CI-A1 unless they say otherwise. They follow the core change's slices 1.1,
1.2, 2.1 to 2.5 and 2.10, which they extend.

- [ ] CI-S1 Fleet model (design decision 1). In `tools/tool-fleet/src/contracts.ts`: the
      cluster purpose `ci` and the capability `ci`; `purposeCapabilities.ci` is
      `control-plane` and `ci`. Test: a fleet with one `ci` cluster of one node carrying both
      decodes. Negatives, each with its own fault: a `platform` or `workers` node that
      carries `ci` is refused (fault: add `ci` to another purpose's list); a `ci` node that
      carries `execution` or a platform capability is refused (fault: skip the purpose's
      capability check for `ci`); a `ci` cluster that requires a platform capability is
      refused (fault: copy the workers guard without the new purpose); a `ci` cluster with
      two servers under `controlPlane: single` is refused (fault: exempt the purpose from
      the topology check); the existing workers negative, one node with `control-plane` and
      `execution`, still fails (fault: widen the exemption to workers).
- [ ] CI-S2 Bootstrap, inventory and registration (design decision 1). The server bootstrap
      accepts the cluster id `ci-production`. Its second revision follows the core change's
      A9, which creates the server: the cluster's entry in `infra/fleet/desired.yaml` and an
      inventory of its own, `infra/ansible/inventory/ci-hosts.yml`, with `h8ci` under
      `k3s_bootstrap_servers`, which is the group `bootstrap.yml` targets, and in no gate
      group; its machine id and private address as the fleet file records them for other
      nodes; and its firewall inputs: the API admitted from the platform node's private
      address and on the tailnet interface, the telemetry and store paths outbound, nothing
      public. A play `ci-cluster.yml`, run from the controller: creates
      the delivery ServiceAccount and its binding on the CI cluster, and writes the cluster
      Secret into the platform cluster's `argocd` namespace. It writes nothing of the
      platform cluster onto the CI cluster. Test: the play against the rehearsal lab of
      CI-S5; a second run changes nothing. Negatives: the play refuses to run when its
      target's cluster id is not of purpose `ci` (fault: take the target from the limit
      alone); it refuses when the platform kubeconfig and the CI kubeconfig name the same
      server (fault: skip the comparison); an inventory that lists the CI server under
      `gate_hosts`, or in the platform cluster's inventory, is refused (fault: read the
      platform inventory only).
- [ ] CI-S3 The CI tree and its delivery rules (design decisions 1 and 3). `infra/argocd/ci`
      with the units C0, C1, C2, C4, C6 and C7; the lock entries for Argo Workflows v4.1.6, Argo Events
      v1.9.11 and Dagger v0.21.12 in `infra/versions/toolchain.json`; the AppProject `ci`
      and its Applications in the platform tree, automated sync off, each with its
      `puni.dev/needs`. Rules added to the `delivery` check family, lettered after the core change's (a) to
      (r): (s) an Application of a
      project other than `ci` names the in-cluster destination only, and one of project
      `ci` names the CI cluster only; (t) every pod template under the CI tree selects `ci`
      and sets requests and limits; (u) a privileged container, a host path or the host
      network appears only in a unit whose namespace ends in `-build`; (v) no ClusterWorkflowTemplate exists under the tree.
      Negatives, each with its own fault: a staging Application that names the CI cluster
      (fault: check the project `ci` only); a `ci` Application that names the in-cluster
      destination (fault: check the other projects only); a CI pod template with no selector
      or no limit (fault: read the platform tree only); a privileged sidecar in the
      tenant's ordinary namespace (fault: match the namespace by prefix `ci-`); a
      ClusterWorkflowTemplate (fault: list namespaced kinds only). The admission copy of (u)
      is in the `ci-policy` unit, with a k3d case in CI-S5.
- [ ] CI-S4 The tenant's unit (design decisions 2, 4 and 5). One kustomize directory whose
      inputs are the tenant's name, its repositories and its `limits.yaml`: the two
      namespaces' objects, quota, limit range, three ServiceAccounts with their Roles, the
      SecretStore and ExternalSecrets, the EventBus, one `calendar` and one `resource` EventSource with their Sensors, two
      Roles (one in the ordinary namespace for `tag:ci-trigger`, one in the `-build`
      namespace for operator identities and the Sensor), the mutex `heavy` at Workflow
      level in both the `gate` and the `staging-build` template with its `namespace` field
      naming the `-build` namespace (design decision 5), the semaphore and limits
      ConfigMaps in the `-build` namespace, the admission policy of design decision 2 for
      Workflows the trigger group creates, in `ci-policy`, the
      engine StatefulSet with its cache claim, and the controller ConfigMap's
      `workflowRestrictions: templateReferencing: Strict`. Test: the directory renders for
      `puni` and for a second, fixture tenant with no other change. Negatives, each with its
      own fault: an EventSource of any type but `calendar` and `resource` is refused (fault:
      refuse the `github` type by name and watch a `webhook` type pass); a binding of
      `tag:ci-trigger` in a `-build` namespace is refused (fault: check a Role's verbs and
      not where it is bound); a trigger workflow file whose job does not run in the
      `staging-trigger` environment, or that reads the key as a repository secret, is
      refused by the lint in `gate` (fault: check the event list only); a Role bound to a trigger
      identity that grants more than create, get, list and watch on Workflows in the
      tenant's namespace is refused (fault: compare verbs only); a Workflow created by the
      trigger group that references `report-status`, or a `staging-build` with a parameter
      other than `sha` and `app`, is refused at admission (fault: rely on the Role, which
      admits any template of the namespace); a `gate` or `staging-build` template without
      the mutex `heavy`, or whose mutex names another namespace than the `-build` one, is
      refused (fault: check that a mutex exists and not where it is); a trigger workflow
      file without the per-app path filter is refused by the lint in `gate` (fault: check
      the event list only); a trigger workflow file in
      a repository that names an event other than `push` to `main` and a manual dispatch
      on `main` is refused by the lint in `gate` (fault: refuse a list of named events and
      watch `pull_request_target` pass); a Sensor trigger that holds an inline Workflow spec instead of a
      `workflowTemplateRef` is refused (fault: accept `operation: submit` alone); a template
      that holds a number for a request or limit instead of the limits parameter is refused
      (fault: check the gate template only); a template in the `-build` namespace that
      mounts a Secret is refused (fault: check `env` and not `volumes`); a controller
      ConfigMap without the restriction is refused (fault: accept any value of the key).
- [ ] CI-S5 Rehearsal (design decisions 5 and 6). A k3d lab profile that brings the CI tree
      up beside the core change's lab and proves, each as a case: an identity bound as the
      trigger is starts a `staging-build` in the ordinary namespace and is refused a
      create in the `-build` namespace, a `get` of a Secret, a `report-status` and a
      `staging-build` with a third parameter; an identity bound as an
      operator is starts a gate from the command line, and the calendar Sensor starts one,
      each through to completion and to its `report-status`; a Workflow submitted with an inline spec, with a
      `podSpecPatch` or with another ServiceAccount is refused by the controller; a second
      gate waits on the semaphore; a `staging-build` submitted while a gate runs waits on
      the mutex `heavy` and starts when the gate ends, and a gate submitted while a build
      runs does the same; a finished `report-status` starts no report, and two finish
      events for one Workflow leave one report; a pod whose request does not fit stays
      Pending and starts when room appears; a privileged pod in the ordinary tenant namespace is refused at
      admission; the gate template's pod, with its Docker sidecar, runs the gate's `bwrap`
      step and one `docker buildx` build; the exit handler runs after a failed main step.
      Receipts are split: CI-S5/A2 (bring-up, admission, trigger cases) and CI-S5/A4 (the
      gate pod's two steps, and the same two steps in the host form of design decision 6 on a
      disposable machine, so that the fallback is known to work before it is needed). Not
      rehearsed here, and stated as such: a full gate, which needs a server.
- [ ] CI-S6 The gate template (design decision 6), in the tenant's `-build` namespace, with
      the host form kept beside it as a second template that is synced only if CI-A4
      chooses it. `WorkflowTemplate` `gate`, started
      nightly by the calendar Sensor of CI-S4; an image that carries the gate's locked tools, built from a Containerfile
      in this repository and locked by digest. The template clones at `sha`, fails unless
      `HEAD` is `sha`, runs the gate steps and mounts no Secret. Test: CI-S5's gate case.
      Negatives: a clone that ends at another commit fails the Workflow (fault: check the
      ref's name, not the commit); the template's image named by tag is refused (fault:
      accept any reference).
- [ ] CI-S7 The staging build (design decision 6; replaces the trigger half of the core
      change's slice 3.7). A Dagger module beside `tools/tool-dagger` with functions to
      build and push an app's images by digest, to render its staging overlay with the
      locked `kustomize`, and to check and commit the render; `WorkflowTemplate`
      `staging-build` that calls them against the tenant's engine. The render's checks and
      their negatives are those of the core change's slice 3.7 and stay there. Added here:
      the template's push and commit steps run in the ordinary tenant namespace and reach
      the engine over the cluster network; no step mounts the App key and the robot
      together with code from `sha` other than the module itself. Test: the module against a
      fixture overlay and a local bare repository. Negative: a step that takes a credential
      and also runs a script from the repository outside the module is refused (fault:
      allow any command in a step that mounts a Secret).
- [ ] CI-S9 Reports and freshness (design decision 2; core decision 9). `WorkflowTemplate`
      `report-status`, in the ordinary namespace, submitted by the resource Sensor, which
      posts one commit status and holds the status App's key. The Sensor's filter admits
      only a Workflow whose `template` label is `gate` or `staging-build` in a terminal
      phase; it names the report after that Workflow's UID and gives it that UID and the
      source's namespace and name as labels, with no owner reference, because the
      source of a gate is in another namespace; the report's own `ttlStrategy` removes
      it after seven days; before submitting, the trigger reads the source Workflow by
      namespace and name, compares its UID with the event's, and submits nothing when
      the source is gone or the UID differs. `WorkflowTemplate`
      `pins-freshness`, started nightly by the calendar Sensor: for each app it compares
      the source commit the pins directory's head names with the latest commit on `main`
      that touches that app's source paths, the same list the trigger filters on, and fails
      when the directory is behind that commit by more than the limit in the tenant's limits file; it
      also fails from 14 days before the trigger key's expiry date, which that file
      holds. Two alert rules in the platform's `alerts` unit, from the CI cluster's
      Workflow metrics: a failed `pins-freshness`, and a failed nightly gate. Tests: both
      templates against fixtures; the rules under `promtool`. Negatives: a pins directory
      one commit behind for longer than the limit fails the check (fault: compare with
      the previous run's head); a merge that touches no path of an app leaves that app's
      check green (fault: compare with the tip of `main`); a finished `report-status`
      starts no report (fault: filter on the phase alone); a second event for one Workflow
      UID creates no second report (fault: use a generated name); a name already taken
      by a report whose UID label differs fails and alerts instead of being skipped
      (fault: treat any existing name as proof); an event whose source Workflow has been
      removed starts nothing (fault: submit from the event's fields alone); a report of
      a gate in the `-build` namespace carries no owner reference and is still there
      after a garbage-collection pass (fault: set the owner reference to the source); a key that expires in 10 days fails it (fault: compare
      with today); a `report-status` that mounts any Secret but the status App's key is
      refused (fault: allow the namespace's Secrets). Due before CI-A3.
- [ ] CI-S8 After CI-A4, with the gate documents' owner: rewrite the gate sections of
      `AGENTS.md` and `docs/infra/gate-hosts.md` for the command of design decision 2, and
      add the runbook `docs/infra/build-ci-cluster.md`. It replaces the core change's slice
      3.3. Test: the document tests of `tool-devsync`.

## 2. Attended steps

They are stage 2 of the core change's build order and replace its A10.

- [ ] CI-A1 Bootstrap the CI cluster, after the core change's A9 has created the server at
      16 vCPUs and 32 GiB (CI13), CI-S1, CI-S2 with its inventory revision for that server,
      and the receipt CI-S5/A2. Who: operator. Commands: `playbooks/firewall.yml` limited
      to the platform node, so that it and the CI server admit each other's private
      address for the two paths of design decision 1;
      `fleet_ansible --limit h8ci playbooks/bootstrap.yml` with the CI inventory, for
      `ci-production`; `playbooks/ci-cluster.yml`; `argocd cluster list` on the platform
      side. Receipt: the node Ready with the capability `ci`; the server's disk at or above
      150 GiB and its memory as decided; the cluster listed by Argo CD as connected; no
      Secret, kubeconfig or token of the platform cluster on the CI node, read back by
      listing. Stop: a platform credential is found on the CI node, or the disk is smaller.
      Rollback: delete the cluster Secret and the server.
- [ ] CI-A2 Sync C0, C1, C2, C4, C6 and C7 and measure, after CI-S3, CI-S4 and the platform cluster's A4.
      Who: operator. Commands: the sync playbook for project `ci` in order; `kubectl top`
      after one hour at rest; the owner signs each device the Tailscale operator made (core
      decision 12). Receipt: each unit Synced and Healthy; the signatures, and what a
      recreated proxy pod needed; the Argo Workflows interface answers on
      its tailnet name and no public port of the server answers; every controller's
      memory against design decision 5; the sum left for jobs. Stop: what is left for jobs
      is under the gate's request. Then the owner chooses the next server class before
      CI-A4. Rollback: remove the Applications; nothing else depends on them.
- [ ] CI-A3 The tenant for gates, after pull request #935's mount for this cluster, the
      core change's task 0.7, CI-S4 and CI-S9. It needs nothing of stage 4. Who: owner for
      the values, operator for the sync. Commands: in this repository's rules, pin the
      required checks `gate` and `pixels` to GitHub Actions as their source; write the
      status App's key to the tenant's store path; sync `ci-puni` (C8) in its first
      revision, which holds no staging credential. Receipt: the required checks' source
      read back; the status ExternalSecret Ready; the tenant's service account reads its
      own store path and is refused another's; an operator identity creates a Workflow in
      the `-build` namespace; `tag:ci-trigger` has no binding there. Stop: a required
      check's source cannot be pinned, in which case the status App is not created and
      CI12 is withdrawn; or the mount gives the CI cluster more than `ci/<tenant>`.
      Rollback: remove the values and the unit.
- [ ] CI-A4 A full gate through a workflow, after CI-S6 and the receipt CI-S5/A4. Who:
      operator. Commands: `argo submit --from workflowtemplate/gate -p sha=<main>` over the
      private access network; the same SHA through `bin/h2puni-gate.sh` on an old gate
      host. Receipt: which form of the gate ran, the pod or the host form of design decision
      6; the Workflow, started by an operator identity, Succeeded and its log prints the SHA; its
      `report-status` posted; its duration, the
      pod's peak memory and its `oom_kill` count of 0; the old host's result on that SHA; a
      second submission waiting on the semaphore. The end-to-end telemetry receipt, a
      metric of this cluster in the platform's Prometheus, is not taken here: the receiver
      exists from the core change's A14, which takes it. This is stage 2's receipt and what guard 5
      of the core change waits for. Stop: the gate fails here for a reason the old host does
      not show on the same SHA, or the pod is killed for memory. Rollback: keep gating on
      the old hosts; they are untouched until stage 5.
- [ ] CI-A5 The staging build, its trigger and the status, in stage 4: after CI-S7, CI-A3
      and the first part of the core change's A23 (the pins repository, its baseline for
      each app, its App and the robot's configuration in the store); before A18's WBS part. Who: operator and owner.
      Commands: merge the tenant unit's second revision, with the staging build's
      ExternalSecrets and template, and sync it; in each repository the tenant builds,
      create the environment `staging-trigger` with a deployment branch rule that admits
      `main` only; make the trigger key, tagged `tag:ci-trigger`, reusable and ephemeral,
      sign it from the owner's device, store it as a secret of that environment and write
      its expiry date into the tenant's limits file; merge the trigger workflow file; then
      a merge to `main` that touches the WBS app; read the Workflow, the pins repository and the
      commit's statuses. Receipt: one Workflow started by the push with no command; one
      commit in the pins repository that names the source commit and the digests; a status
      under `argo/` on that commit; the required checks' source read back as GitHub Actions;
      the environment's branch rule read back; a workflow pushed on a branch of the
      repository that names the environment refused it, with no device joined; a device
      tagged `tag:ci-trigger` creating a `staging-build`, refused a create in the `-build`
      namespace, a `get` of a Secret, a `report-status`, a `staging-build` with a third
      parameter and the Argo Workflows interface; a `staging-build`
      submitted by hand with a `sha` that is not on `main` failing at its first step; a
      merge to `main` that touches no app path starting no Workflow and leaving
      `pins-freshness` green; a `staging-build` submitted while a gate runs waiting on the
      mutex and starting when the gate ends; one report for the build and none for the
      report itself. Stop:
      a workflow on a branch obtains the key, the trigger identity can start a gate or a
      report, a build and a gate run at once, or
      the status can satisfy a required check. The key is renewed by this step's key part
      before it expires, at most every 90 days; CI-S9's check warns 14 days ahead. Rollback:
      remove the trigger workflow file; the owner's waiver of core decision 9 then applies.
