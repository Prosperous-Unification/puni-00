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
      Receipt: the overrules, dated and quoted, in verify.md. No slice starts
      before the core change's task 0.1 has its receipt.
- [ ] CI-0.2 File the decision record from design.md as an ADR under the next free number,
      once the core change's two have theirs, link it from proposal.md, and delete the quoted
      copy. Test: `env -u CLAUDECODE bun test tools/tool-devsync/src/adr-index.test.ts`.
- [ ] CI-0.3 After CI-0.1: tell the owners design decision 9 names what it asks of each: the
      gate pool's, the gate documents', the release tooling's, pull request #935's and the
      Harbor change's. Receipt: the messages, dated, in verify.md.

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
- [ ] CI-S2 Bootstrap and registration (design decision 1). The server bootstrap accepts the
      cluster id `ci-production`. A play `ci-cluster.yml`, run from the controller: creates
      the delivery ServiceAccount and its binding on the CI cluster, and writes the cluster
      Secret into the platform cluster's `argocd` namespace. It writes nothing of the
      platform cluster onto the CI cluster. Test: the play against the rehearsal lab of
      CI-S5; a second run changes nothing. Negatives: the play refuses to run when its
      target's cluster id is not of purpose `ci` (fault: take the target from the limit
      alone); it refuses when the platform kubeconfig and the CI kubeconfig name the same
      server (fault: skip the comparison).
- [ ] CI-S3 The CI tree and its delivery rules (design decisions 1 and 3). `infra/argocd/ci`
      with the units C0, C1, C2, C4, C6 and C7; the lock entries for Argo Workflows v4.1.6, Argo Events
      v1.9.11 and Dagger v0.21.12 in `infra/versions/toolchain.json`; the AppProject `ci`
      and its Applications in the platform tree, automated sync off, each with its
      `puni.dev/needs`. Rules added to the `delivery` check family: (q) an Application of a
      project other than `ci` names the in-cluster destination only, and one of project
      `ci` names the CI cluster only; (r) every pod template under the CI tree selects `ci`
      and sets requests and limits; (s) a privileged container, a host path or the host
      network appears only in a unit whose namespace ends in `-build`; (t) no ClusterWorkflowTemplate exists under the tree.
      Negatives, each with its own fault: a staging Application that names the CI cluster
      (fault: check the project `ci` only); a `ci` Application that names the in-cluster
      destination (fault: check the other projects only); a CI pod template with no selector
      or no limit (fault: read the platform tree only); a privileged sidecar in the
      tenant's ordinary namespace (fault: match the namespace by prefix `ci-`); a
      ClusterWorkflowTemplate (fault: list namespaced kinds only). The admission copy of (s)
      is in the `ci-policy` unit, with a k3d case in CI-S5.
- [ ] CI-S4 The tenant's unit (design decisions 2, 4 and 5). One kustomize directory whose
      inputs are the tenant's name, its repositories and its `limits.yaml`: the two
      namespaces' objects, quota, limit range, three ServiceAccounts with their Roles, the
      SecretStore and ExternalSecrets, the EventBus, one `calendar` EventSource and its Sensor, the Role that
      the trigger identities are bound to, two PriorityClass names so that a build's pods
      rank under a gate's, the semaphore ConfigMap, the limits ConfigMap, the
      engine StatefulSet with its cache claim, and the controller ConfigMap's
      `workflowRestrictions: templateReferencing: Strict`. Test: the directory renders for
      `puni` and for a second, fixture tenant with no other change. Negatives, each with its
      own fault: an EventSource of any type but `calendar` is refused (fault: refuse the
      `github` type by name and watch a `webhook` type pass); a Role bound to a trigger
      identity that grants more than create, get, list and watch on Workflows in the
      tenant's namespace is refused (fault: compare verbs only); a trigger workflow file in
      a repository that names an event other than `push` to `main` and a manual dispatch
      on `main` is refused by the lint in `gate` (fault: refuse a list of named events and
      watch `pull_request_target` pass); a Sensor trigger that holds an inline Workflow spec instead of a
      `workflowTemplateRef` is refused (fault: accept `operation: submit` alone); a template
      that holds a number for a request or limit instead of the limits parameter is refused
      (fault: check the gate template only); a template in the `-build` namespace that
      mounts a Secret is refused (fault: check `env` and not `volumes`); a controller
      ConfigMap without the restriction is refused (fault: accept any value of the key).
- [ ] CI-S5 Rehearsal (design decisions 5 and 6). A k3d lab profile that brings the CI tree
      up beside the core change's lab and proves, each as a case: a signed delivery for
      `main` starts one Workflow and an unsigned one, one for another ref and one for
      another repository start none; a Workflow submitted with an inline spec, with a
      `podSpecPatch` or with another ServiceAccount is refused by the controller; a second
      gate waits on the semaphore; a pod whose request does not fit stays Pending and starts
      when room appears; a privileged pod in the ordinary tenant namespace is refused at
      admission; the gate template's pod, with its Docker sidecar, runs the gate's `bwrap`
      step and one `docker buildx` build; the exit handler runs after a failed main step.
      Receipts are split: CI-S5/A2 (bring-up, admission, trigger cases) and CI-S5/A4 (the
      gate pod's two steps). Not rehearsed here, and stated as such: a full gate, which needs
      a server.
- [ ] CI-S6 The gate template (design decision 6). `WorkflowTemplate` `gate`, started
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
- [ ] CI-S8 After CI-A4, with the gate documents' owner: rewrite the gate sections of
      `AGENTS.md` and `docs/infra/gate-hosts.md` for the command of design decision 2, and
      add the runbook `docs/infra/build-ci-cluster.md`. It replaces the core change's slice
      3.3. Test: the document tests of `tool-devsync`.

## 2. Attended steps

They are stage 2 of the core change's build order and replace its A10.

- [ ] CI-A1 Bootstrap the CI cluster, after the core change's A9 has created the server at
      12 vCPUs and 24 GiB (CI13), its 1.3 revision, CI-S1, CI-S2 and the receipt CI-S5/A2.
      Who: operator. Commands: `fleet_ansible --limit h8ci playbooks/bootstrap.yml` for
      `ci-production`; `playbooks/ci-cluster.yml`; `argocd cluster list` on the platform
      side. Receipt: the node Ready with the capability `ci`; the server's disk at or above
      150 GiB and its memory as decided; the cluster listed by Argo CD as connected; no
      Secret, kubeconfig or token of the platform cluster on the CI node, read back by
      listing. Stop: a platform credential is found on the CI node, or the disk is smaller.
      Rollback: delete the cluster Secret and the server.
- [ ] CI-A2 Sync C0, C1, C2, C4, C6 and C7 and measure, after CI-S3, CI-S4 and the platform cluster's A4.
      Who: operator. Commands: the sync playbook for project `ci` in order; `kubectl top`
      after one hour at rest. Receipt: each unit Synced and Healthy; the Argo Workflows interface answers on
      its tailnet name and no public port of the server answers; every controller's
      memory against design decision 5; the sum left for jobs. Stop: what is left for jobs
      is under the gate's request. Then the owner chooses the next server class before
      CI-A4. Rollback: remove the Applications; nothing else depends on them.
- [ ] CI-A3 The tenant, its secrets and its trigger, after pull request #935's mount for
      this cluster, the core change's task 0.7 and the first part of its A23 (the pins
      repository, its App and the robot's configuration in the store). Who: owner for the
      values, operator for the sync. Commands: in this repository's rules, pin the required
      checks `gate` and `pixels` to GitHub Actions as their source; write the status App's
      key to the tenant's store path, beside the two A23 wrote; sync `ci-puni` (C8); make
      the trigger key, tagged `tag:ci-trigger`, reusable and ephemeral, sign it from the
      owner's device, store it as a secret of each repository the tenant builds, and note
      its expiry date in the runbook; merge the trigger workflow file. Receipt: the required
      checks' source read back; each ExternalSecret Ready; a device tagged
      `tag:ci-trigger` creates a Workflow from a template and is refused a `get` of a
      Secret and a create in another namespace; the same device cannot reach the Argo
      Workflows interface or any server; the tenant's service account reads its own store
      path and is refused another's. Stop: a required check's source cannot be pinned, in
      which case the status App is not created and CI12 is withdrawn; the mount gives the
      CI cluster more than `ci/<tenant>`; or the trigger identity can do more than the
      Role states. Rollback: delete the repository secret, the trigger file and the values.
      The key is renewed by this step's key part before it expires, at most every 90 days.
- [ ] CI-A4 A full gate through a workflow, after CI-S6 and the receipt CI-S5/A4. Who:
      operator. Commands: `argo submit --from workflowtemplate/gate -p sha=<main>` over the
      private access network; the same SHA through `bin/h2puni-gate.sh` on an old gate
      host. Receipt: the Workflow Succeeded and its log prints the SHA; its duration, the
      pod's peak memory and its `oom_kill` count of 0; the old host's result on that SHA; a
      second submission waiting on the semaphore. This is stage 2's receipt and what guard 5
      of the core change waits for. Stop: the gate fails here for a reason the old host does
      not show on the same SHA, or the pod is killed for memory. Rollback: keep gating on
      the old hosts; they are untouched until stage 5.
- [ ] CI-A5 The staging build and the status, after CI-S7, CI-A3 and the first part of the core
      change's A23; before A18's WBS part. Who: operator and owner. Commands: a merge to
      `main` that touches the WBS app; read the Workflow, the pins repository and the
      commit's statuses. Receipt: one Workflow started by the push with no command; one
      commit in the pins repository that names the source commit and the digests; a status
      under `argo/` on that commit; the required checks' source read back as GitHub Actions;
      a push to a branch other than `main` starting nothing; a `staging-build` submitted
      by hand with a `sha` that is not on `main` failing at its first step. Stop: a push to
      a branch starts a Workflow, or the status can satisfy a required check. Rollback:
      remove the trigger workflow file; the owner's waiver of core decision 9 then applies.
