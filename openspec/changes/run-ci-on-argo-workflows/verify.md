# CI orchestration verification

## Status

Plan only. No source outside this change, no manifest, host, cluster or provider resource
was changed. No task in tasks.md is done. This record holds only what was read while writing
the plan, on 2026-11-22, in a worktree at `origin/main` `b17861f83`.

## Where this came from

On 2026-11-22 the owner asked for a self-hosted tool to orchestrate CI. The eleventh draft
of `separate-node-roles` carried it as an open question. He chose Woodpecker CI with Dagger,
then, with multitenancy in mind, Argo Workflows and Argo Events. This change is the planning
session's working-out of that choice; its split from the core change is the session's
scoping, as with the other two, and the owner may overrule it.

## What was read, and where

Versions are the newest releases on 2026-11-22. Documentation and source were read at these
tags in the projects' repositories.

| Claim the plan relies on                                                                                                                                 | Read in                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Argo Workflows v4.1.6: cluster, namespace and managed-namespace installs; full CRDs since 4.0 need server-side apply                                     | `docs/installation.md`, `docs/managed-namespace.md`                                                         |
| `templateReferencing: Strict` and `Secure`; the fields a submission may set, and that `serviceAccountName`, `podSpecPatch`, `volumes` are not among them | `docs/workflow-restrictions.md`                                                                             |
| Auth modes `server`, `client`, `sso`; `client` is the default and uses the caller's bearer token                                                         | `docs/argo-server-auth-mode.md`, `docs/access-token.md`                                                     |
| SSO RBAC maps a user to a ServiceAccount by annotation and is installation-level                                                                         | `docs/argo-server-sso.md`                                                                                   |
| The executor's minimum Role; a Workflow's pods run as its ServiceAccount                                                                                 | `docs/workflow-rbac.md`                                                                                     |
| Users should not create Workflows in the controller's namespace                                                                                          | `docs/security.md`                                                                                          |
| Mutexes and semaphores; local locks need a ConfigMap and no database; shared locks need one                                                              | `docs/synchronization.md`                                                                                   |
| The workflow archive needs PostgreSQL, MySQL or MariaDB and does not keep pod logs; logs need an artifact repository                                     | `docs/workflow-archive.md`                                                                                  |
| Exit handlers always run and see the Workflow's status                                                                                                   | `docs/walk-through/exit-handlers.md`                                                                        |
| CronWorkflow `schedules` and `concurrencyPolicy`                                                                                                         | `docs/cron-workflows.md`                                                                                    |
| `podSpecPatch` parameterises resource limits; an input parameter can be read from a ConfigMap key                                                        | `docs/fields.md`, `docs/cost-optimisation.md`                                                               |
| Controller metrics exist per WorkflowTemplate (`workflowtemplate_runtime`, `workflowtemplate_triggered_total`)                                           | `docs/metrics.md`                                                                                           |
| Argo Events v1.9.11: a GitHub event source registers the hook only when `apiToken` is set; `webhookSecret` is optional                                   | `examples/event-sources/github.yaml`, `pkg/apis/events/v1alpha1/eventsource_types.go`                       |
| The event source validates a delivery against the hook secret                                                                                            | `pkg/eventsources/sources/github/start.go`                                                                  |
| The event source needs an ingress to be reached from GitHub                                                                                              | `docs/eventsources/setup/github.md`                                                                         |
| Sensor data filters, and a trigger that submits a Workflow by `workflowTemplateRef`                                                                      | `docs/sensors/filters/data.md`, `docs/sensors/triggers/argo-workflow.md`                                    |
| An EventBus is namespaced; a JetStream bus defaults to three replicas                                                                                    | `docs/eventbus/eventbus.md`, `docs/eventbus/jetstream.md`, `pkg/apis/events/v1alpha1/jetstream_eventbus.go` |
| Kueue v0.20.7 does not manage Workflows; it manages their pods one by one, and a Workflow can wait for quota part-way                                    | `site/content/en/docs/tasks/run/external_workloads/argo_workflow.md`                                        |
| The cluster autoscaler has cloud providers for the current host and for the one the owner named                                                          | the directory list of `cluster-autoscaler/cloudprovider`                                                    |
| Dagger v0.21.12 in Argo Workflows: the CLI in a step, the engine privileged, reached through `_EXPERIMENTAL_DAGGER_RUNNER_HOST`                          | `docs/current_docs/getting-started/ci-integrations/argo-workflows.mdx` and its snippet                      |
| Dagger on Kubernetes: a DaemonSet by default, a StatefulSet with a claim as an option; a node removed loses its cache                                    | `docs/current_docs/reference/deployment/kubernetes.mdx`, `helm/dagger/values.yaml`                          |
| The runner host may be a UNIX socket, a TCP address or a Kubernetes pod                                                                                  | `docs/current_docs/reference/configuration/custom-runner.mdx`                                               |
| The TypeScript SDK supports Node.js and, as experimental, Bun                                                                                            | `docs/current_docs/extending/custom-applications/typescript.mdx`                                            |

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

| Date       | Decision, in his words                                                                                                                                                | Where           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 2026-11-22 | "i want a self-hosted tool that will help orchestrate the CI so that i don't need to build one"                                                                       | CI1             |
| 2026-11-22 | "ok let's plan for dagger + woodpecker ci for the ci"; then "ok let's replan for argo workflows and argo events"                                                      | CI1             |
| 2026-11-22 | "ok let's go for the woodpecker", in answer to whether the orchestrator alone admits jobs or the host pool stays underneath                                           | CI2             |
| 2026-11-22 | "i want to reuse as much software as possible, however it all has to be dynamic/configurable and be orchestrated with the puni user platform (wbs is core of it now)" | CI3             |
| 2026-11-22 | "let's keep in mind that all this has to be multitenant"; "all that must be orchestratable by the puni user platform, must be multitenant"                            | CI3, CI10       |
| 2026-11-22 | "autoscaler is promising - maybe we can connect the AWS to provide additional scale?"; "dynamic environments are promising and interesting"                           | CI4, decision 7 |
| 2026-11-22 | "i'll use tailscale for access"                                                                                                                                       | CI11            |

## Checks run on this draft

Recorded in the core change's verify.md with the checks of the same commit.
