# CI orchestration verification

## Status

Plan only. No source outside this change, no manifest, host, cluster or provider resource
was changed. No task in tasks.md is done. This record holds only what was read while writing
the plan, on 2026-11-22, in a worktree at `origin/main` `b17861f83`.

## Where this came from

On 2026-11-22 the owner asked for a self-hosted tool to orchestrate CI. an earlier draft
of `separate-node-roles` carried it as an open question. He chose Woodpecker CI with Dagger,
then, with multitenancy in mind, Argo Workflows and Argo Events. This change is the planning
session's working-out of that choice; its split from the core change is the session's
scoping, as with the other two, and the owner may overrule it.

## What was read, and where

Versions are the newest releases on 2026-11-22. Documentation and source were read at these
tags in the projects' repositories.

| Claim the plan relies on                                                                                                                                                                                                                                                                     | Read in                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Argo Workflows v4.1.6: cluster, namespace and managed-namespace installs; full CRDs since 4.0 need server-side apply                                                                                                                                                                         | `docs/installation.md`, `docs/managed-namespace.md`                                                                                                          |
| `templateReferencing: Strict` and `Secure`; the fields a submission may set, and that `serviceAccountName`, `podSpecPatch`, `volumes` are not among them                                                                                                                                     | `docs/workflow-restrictions.md`                                                                                                                              |
| Auth modes `server`, `client`, `sso`; `client` is the default and uses the caller's bearer token                                                                                                                                                                                             | `docs/argo-server-auth-mode.md`, `docs/access-token.md`                                                                                                      |
| SSO RBAC maps a user to a ServiceAccount by annotation and is installation-level                                                                                                                                                                                                             | `docs/argo-server-sso.md`                                                                                                                                    |
| The executor's minimum Role; a Workflow's pods run as its ServiceAccount                                                                                                                                                                                                                     | `docs/workflow-rbac.md`                                                                                                                                      |
| Users should not create Workflows in the controller's namespace                                                                                                                                                                                                                              | `docs/security.md`                                                                                                                                           |
| Mutexes and semaphores; local locks need no database, and a semaphore reads its size from a ConfigMap; a lock is a namespace and a key, the `namespace` field overrides the Workflow's, so one controller shares a local mutex between namespaces; locks between controllers need a database | `docs/synchronization.md`, section Namespaces, and the `Mutex` and `SemaphoreRef` types in `pkg/apis/workflow/v1alpha1/workflow_types.go`, at the pinned tag |
| The workflow archive needs PostgreSQL, MySQL or MariaDB and does not keep pod logs; logs need an artifact repository                                                                                                                                                                         | `docs/workflow-archive.md`                                                                                                                                   |
| Exit handlers always run and see the Workflow's status                                                                                                                                                                                                                                       | `docs/walk-through/exit-handlers.md`                                                                                                                         |
| CronWorkflow `schedules` and `concurrencyPolicy`                                                                                                                                                                                                                                             | `docs/cron-workflows.md`                                                                                                                                     |
| `podSpecPatch` parameterises resource limits; an input parameter can be read from a ConfigMap key                                                                                                                                                                                            | `docs/fields.md`, `docs/cost-optimisation.md`                                                                                                                |
| Controller metrics exist per WorkflowTemplate (`workflowtemplate_runtime`, `workflowtemplate_triggered_total`)                                                                                                                                                                               | `docs/metrics.md`                                                                                                                                            |
| Argo Events v1.9.11: a GitHub event source registers the hook only when `apiToken` is set; `webhookSecret` is optional                                                                                                                                                                       | `examples/event-sources/github.yaml`, `pkg/apis/events/v1alpha1/eventsource_types.go`                                                                        |
| The event source validates a delivery against the hook secret                                                                                                                                                                                                                                | `pkg/eventsources/sources/github/start.go`                                                                                                                   |
| The event source needs an ingress to be reached from GitHub                                                                                                                                                                                                                                  | `docs/eventsources/setup/github.md`                                                                                                                          |
| Sensor data filters, and a trigger that submits a Workflow by `workflowTemplateRef`                                                                                                                                                                                                          | `docs/sensors/filters/data.md`, `docs/sensors/triggers/argo-workflow.md`                                                                                     |
| An EventBus is namespaced; a JetStream bus defaults to three replicas                                                                                                                                                                                                                        | `docs/eventbus/eventbus.md`, `docs/eventbus/jetstream.md`, `pkg/apis/events/v1alpha1/jetstream_eventbus.go`                                                  |
| Kueue v0.20.7 does not manage Workflows; it manages their pods one by one, and a Workflow can wait for quota part-way                                                                                                                                                                        | `site/content/en/docs/tasks/run/external_workloads/argo_workflow.md`                                                                                         |
| The cluster autoscaler has cloud providers for the current host and for the one the owner named                                                                                                                                                                                              | the directory list of `cluster-autoscaler/cloudprovider`                                                                                                     |
| Dagger v0.21.12 in Argo Workflows: the CLI in a step, the engine privileged, reached through `_EXPERIMENTAL_DAGGER_RUNNER_HOST`                                                                                                                                                              | `docs/current_docs/getting-started/ci-integrations/argo-workflows.mdx` and its snippet                                                                       |
| Dagger on Kubernetes: a DaemonSet by default, a StatefulSet with a claim as an option; a node removed loses its cache                                                                                                                                                                        | `docs/current_docs/reference/deployment/kubernetes.mdx`, `helm/dagger/values.yaml`                                                                           |
| The runner host may be a UNIX socket, a TCP address or a Kubernetes pod                                                                                                                                                                                                                      | `docs/current_docs/reference/configuration/custom-runner.mdx`                                                                                                |
| The TypeScript SDK supports Node.js and, as experimental, Bun                                                                                                                                                                                                                                | `docs/current_docs/extending/custom-applications/typescript.mdx`                                                                                             |

In this repository: the catalogue's figures for `gate` and `release-build`
(`infra/jobs/catalogue.json`); the gate's `bwrap` step and its Docker use
(`bin/h2puni-gate-steps.sh`, `bin/h2puni-gate.sh`); the two cluster purposes and the guard
against `control-plane` with `execution` (`tools/tool-fleet/src/contracts.ts`);
`tools/tool-dagger` and the SDK's version in `package.json`; the three route families of
the `puni-user-platform` backend named in design.md
(`apps/wbs/be-01/src/testing/organization-route-inventory.ts`,
`libs/wbs/domain/contracts/src/http/`).

## Not verified

The list is in design.md under "Not verified". The ones that could change the design: the
gate inside a pod, the controllers' memory, and whether a required check's source can be
pinned.

## Owner's decisions recorded

| Date       | Decision                                                                                               | Where           |
| ---------- | ------------------------------------------------------------------------------------------------------ | --------------- |
| 2026-11-22 | A self-hosted tool orchestrates CI, so that the owner does not have to build one                       | CI1             |
| 2026-11-22 | First Woodpecker CI with Dagger, then, for multitenancy, Argo Workflows and Argo Events with Dagger    | CI1             |
| 2026-11-22 | The orchestrator alone admits jobs; the host pool is not used on the new capacity                      | CI2             |
| 2026-11-22 | Reuse existing software; all of it dynamic, configurable and orchestrated by the `puni-user-platform`  | CI3             |
| 2026-11-22 | All of it is multitenant                                                                               | CI3, CI10       |
| 2026-11-22 | Autoscaling, a second provider and per-pull-request environments are of interest, not a starting point | CI4, decision 7 |
| 2026-11-22 | Tailscale is the access path; platform services are not exposed to the internet                        | CI11            |

## The pass of 2026-11-22 that removed the public path

The owner was away and had set the goal of finalizing and merging the plan. Three points
were settled for him, each an assumption he can overrule: no public path (CI11), a status
written to GitHub (CI12), and a server of 12 vCPUs and 24 GiB (CI13). The two open
questions of an earlier draft are closed by them.

What changed: the GitHub event source, its webhook secret, the ingress route, and the units
`ci-cert-manager`, `ci-traefik` and `ci-issuers` are gone; the unit `ci-tailscale-operator`
is new, at C2; the nightly gate is started by a calendar event source and a Sensor instead
of a CronWorkflow; a trigger workflow file on the provider's hosted runner starts the
staging build. The ids C3 and C5 are not reused.

| Read on 2026-11-22                                                                                                                                                                                                       | Where                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| The vendor's GitHub Action joins a tailnet as an ephemeral, tagged device, with a federated identity, an OAuth client or an auth key that is tagged, reusable and ephemeral; the device is removed when the job logs out | Tailscale documentation, "Tailscale GitHub Action"                         |
| The Kubernetes operator's API server proxy has an `auth` mode that impersonates a tagged device as its name with its tags as Kubernetes groups, and a `noauth` mode                                                      | Tailscale documentation, "Access the Kubernetes API server over Tailscale" |
| Tailnet Lock requires a signature for a new device, and an auth key can be signed beforehand                                                                                                                             | Tailscale documentation, "Tailnet Lock"                                    |
| An auth key expires after at most 90 days                                                                                                                                                                                | Tailscale documentation, "Auth keys"                                       |
| Argo Events v1.9.11 has a `calendar` event source with a `schedule`                                                                                                                                                      | `examples/event-sources/calendar.yaml` at the tag                          |

Not found, and listed under "Not verified" in design.md: whether a federated identity can
join under Tailnet Lock; the literal form of a tag as a Kubernetes group; whether a
calendar event source opens a port.

## Checks run on this draft

Recorded in the core change's verify.md with the checks of the same commit.

## The pass of 2026-11-22 that folded two reviews

Two reviews read the commit `08507cb8e`; the core change's verify.md lists every finding and
its outcome. In this change: the trigger key moved into an environment that admits `main`
only; the gate's template, Workflows and ConfigMaps moved to the `-build` namespace, with a
Role for operator identities and the schedule only; results are posted by `report-status`
from the ordinary namespace; a build waits behind a gate (by quota in that pass, by a shared mutex since the next); the host form of the
gate is the stated fallback; CI-A3 no longer waits on stage 4, and the staging build's part
of the tenant moved to CI-A5; slice CI-S9 is new; CI-S2 writes the cluster's inventory after
the server exists; the rules of CI-S3 are lettered (s) to (v). None of this was run.

## The pass of 2026-11-22 that folded the second reading of that review

The reviewer read the commit `3f7b5f60b`; the core change's verify.md lists each finding and
its outcome. In this change: an admission policy limits what the trigger group may create to
`staging-build` with its two parameters; a gate and a build are kept apart by one mutex that
both templates name in the `-build` namespace, which replaces the quota, since a quota
counts one namespace; the report Sensor filters on the `template` label and a terminal
phase and names the report after the Workflow's UID; the freshness check and the trigger
use each app's source paths; the end-to-end telemetry receipt moved from CI-A2 to the core
change's A14; receipts of telling other owners are dated decisions, not messages. Not
verified: that the pinned controller applies a Workflow-level mutex of a template under
`templateReferencing: Strict` as it does for an inline one, which CI-S5's overlap case
shows. None of this was run.
